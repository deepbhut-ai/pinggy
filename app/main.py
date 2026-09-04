"""FastAPI application entrypoint."""
import asyncio
import sys
from contextlib import asynccontextmanager

# psycopg3 async requires the SelectorEventLoop on Windows (Proactor is default).
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.db import close_pool, init_pool
from app.api.routers.admin import router as admin_router
from app.core.ip_monitor import IPMonitorMiddleware
from app.core.rate_limit import RateLimitMiddleware
from app.core.proxy import TunnelProxyMiddleware
from app.core.redis import close_redis, init_redis
from app.core.tunnel_registry import init_registry


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — DB + migrations are handled by run_auto_setup() in run.py
    # before the server starts. Here we just init the pool.
    await init_pool()
    print(f"[{settings.APP_NAME}] DB pool ready on {settings.async_dsn}")

    # Initialize Redis (for IP monitoring + cache)
    await init_redis()
    if settings.REDIS_ENABLED:
        print(f"[{settings.APP_NAME}] Redis {'connected' if True else 'failed'} on {settings.REDIS_URL}")

    # Initialize tunnel registry
    init_registry(settings.TUNNEL_DOMAIN, settings.PROXY_PORT)

    # Start SSH server for tunnels
    from app.core.ssh_server import start_ssh_server
    ssh_server = await start_ssh_server()

    # Weekly digest scheduler (v1.13.0)
    from app.core.digest import start_digest_task
    digest_task = start_digest_task()
    print(f"[{settings.APP_NAME}] Weekly digest scheduler started")

    yield

    # Shutdown
    digest_task.cancel()
    ssh_server.close()
    await ssh_server.wait_closed()
    print(f"[{settings.APP_NAME}] SSH server stopped")
    await close_redis()
    print(f"[{settings.APP_NAME}] Redis closed")
    await close_pool()
    print(f"[{settings.APP_NAME}] DB pool closed")


app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.APP_DEBUG,
    lifespan=lifespan,
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# NOTE on Starlette middleware order: LAST added = OUTERMOST (runs first on requests).
# RateLimit (v1.10.0) is outermost — DDoS / API-hit shield in front of everything.
# IPMonitor counts requests; TunnelProxy forwards tunnel traffic to SSH ports.
app.add_middleware(TunnelProxyMiddleware)
app.add_middleware(IPMonitorMiddleware)
app.add_middleware(RateLimitMiddleware)


# Security headers (v1.11.0) — added FIRST here so it ends up innermost,
# wrapping every HTTP response the app produces (docs pages, API JSON, HTML)
from starlette.middleware.base import BaseHTTPMiddleware  # noqa: E402
from starlette.requests import Request  # noqa: E402


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
            resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return resp


app.add_middleware(SecurityHeadersMiddleware)

# WebSocket tunnel pass-through (v1.10.0) — pure ASGI route, bypasses HTTP middlewares
from starlette.routing import WebSocketRoute  # noqa: E402
from starlette.websockets import WebSocket  # noqa: E402
from app.core.proxy import tunnel_websocket  # noqa: E402


async def _ws_entry(websocket: WebSocket):
    await tunnel_websocket(websocket.scope, websocket.receive, websocket.send)


app.router.routes.append(WebSocketRoute("/{rest:path}", _ws_entry))

app.include_router(api_router, prefix="/api/v1")
app.include_router(admin_router)  # /admin, /dashboard, / (landing page)


@app.get("/health", tags=["system"])
async def health():
    """Return basic service metadata for uptime checks."""
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}
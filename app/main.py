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

    # Reconcile stale DB tunnel rows after a process restart
    from app.core.tunnel_registry import reconcile_tunnels_with_db
    reconcile_result = await reconcile_tunnels_with_db()
    print(f"[{settings.APP_NAME}] Tunnel registry reconciled: {reconcile_result}")

    # v2.10.0: Start periodic stale-tunnel reconciliation (every 5 min)
    from app.core.tunnel_registry import periodic_reconcile_stale_tunnels
    reconcile_task = asyncio.create_task(periodic_reconcile_stale_tunnels())
    print(f"[{settings.APP_NAME}] Periodic tunnel reconciliation started (every 5 min)")

    # Start SSH server for tunnels
    from app.core.ssh_server import start_ssh_server
    ssh_server = await start_ssh_server()

    # Weekly digest scheduler (v1.13.0)
    from app.core.digest import start_digest_task
    digest_task = start_digest_task()
    print(f"[{settings.APP_NAME}] Weekly digest scheduler started")

    # Automatic SSL certificate renewal scheduler (Doc/ssl.md)
    from app.core.ssl_manager import start_ssl_renewal_task
    ssl_renewal_task = start_ssl_renewal_task()
    print(f"[{settings.APP_NAME}] SSL auto-renewal scheduler started (every 12h)")

    yield

    # Shutdown
    reconcile_task.cancel()
    ssl_renewal_task.cancel()
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
    description="IRAGT secure tunnel platform API — manage tokens, tunnels, domains, billing, and teams.",
    version="1.0.0",
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
    """Return service health with DB + Redis checks for watchdog monitoring (v2.8.7).

    Status is "ok" only when all checks pass. If DB or Redis is down, status is
    "degraded" — systemd watchdog will restart the service after WatchdogSec.
    """
    checks = {}
    overall = "ok"

    # DB check
    try:
        from app.core.db import get_pool
        pool = get_pool()
        if pool:
            async with pool.connection() as conn:
                cur = await conn.execute("SELECT 1")
                await cur.fetchone()
                await cur.close()
            checks["db"] = "ok"
        else:
            checks["db"] = "no pool"
            overall = "degraded"
    except Exception as e:
        checks["db"] = f"error: {e!s:.60}"
        overall = "degraded"

    # Redis check (optional — app works without Redis but degraded)
    try:
        from app.core.redis import get_redis
        r = get_redis()
        if r is not None:
            await r.ping()
            checks["redis"] = "ok"
        else:
            checks["redis"] = "disabled"
    except Exception as e:
        checks["redis"] = f"error: {e!s:.60}"
        overall = "degraded"

    # Active tunnels count
    try:
        from app.core.tunnel_registry import list_tunnels
        tunnels = await list_tunnels()
        checks["tunnels"] = len(tunnels)
    except Exception:
        checks["tunnels"] = "unknown"

    return {
        "status": overall,
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
        "checks": checks,
    }
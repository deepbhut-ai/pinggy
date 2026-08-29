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

    yield

    # Shutdown
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
# Added below in order CORS → IPMonitor → TunnelProxy, so the actual request flow is:
#   TunnelProxy → IPMonitor → CORS → routes
# Consequence: subdomain tunnel requests are intercepted and proxied by
# TunnelProxy BEFORE IPMonitor sees them, so proxied tunnel traffic is NOT
# counted by the IP monitor. Swap the two add_middleware calls below to change that.
app.add_middleware(IPMonitorMiddleware)
app.add_middleware(TunnelProxyMiddleware)

app.include_router(api_router, prefix="/api/v1")
app.include_router(admin_router)  # /admin, /dashboard, / (landing page)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}
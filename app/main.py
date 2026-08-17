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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — DB + migrations are handled by run_auto_setup() in run.py
    # before the server starts. Here we just init the pool.
    await init_pool()
    print(f"[{settings.APP_NAME}] DB pool ready on {settings.async_dsn}")
    yield
    # Shutdown
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

app.include_router(api_router, prefix="/api/v1")
app.include_router(admin_router)  # /admin panel (no API prefix)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}
"""Dev runner: python run.py"""
import asyncio
import sys

# psycopg3 async requires the SelectorEventLoop on Windows.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Run auto-setup (create DB + migrations + default admin) BEFORE uvicorn starts.
# This is sync and must complete before the async event loop takes over.
from app.core.auto_setup import run_auto_setup
run_auto_setup()

import uvicorn

from app.core.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=False,
    )
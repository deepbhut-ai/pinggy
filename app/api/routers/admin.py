"""Admin panel router — serves the static admin HTML at /admin."""
from pathlib import Path

from fastapi import APIRouter
from starlette.responses import HTMLResponse

router = APIRouter(tags=["admin"])

_ADMIN_HTML_PATH = Path(__file__).resolve().parents[2] / "static" / "admin.html"
_DASHBOARD_HTML_PATH = Path(__file__).resolve().parents[2] / "static" / "dashboard.html"


@router.get("/admin", response_class=HTMLResponse)
async def admin_panel():
    """Serve the admin web panel."""
    return HTMLResponse(content=_ADMIN_HTML_PATH.read_text(encoding="utf-8"))


@router.get("/dashboard", response_class=HTMLResponse)
async def user_dashboard():
    """Serve the user dashboard (separate from admin)."""
    return HTMLResponse(content=_DASHBOARD_HTML_PATH.read_text(encoding="utf-8"))
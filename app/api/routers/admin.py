"""Admin panel router — serves the static admin HTML at /admin."""
from pathlib import Path

from fastapi import APIRouter
from starlette.responses import HTMLResponse

router = APIRouter(tags=["admin"])

_ADMIN_HTML_PATH = Path(__file__).resolve().parents[2] / "static" / "admin.html"
_DASHBOARD_HTML_PATH = Path(__file__).resolve().parents[2] / "static" / "dashboard.html"
_LANDING_HTML_PATH = Path(__file__).resolve().parents[2] / "static" / "landing.html"
_LOGIN_HTML_PATH = Path(__file__).resolve().parents[2] / "static" / "login.html"

# no-store prevents browser back/forward cache (bfcache) from showing
# logged-in pages after logout
_NO_STORE = {"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}


@router.get("/", response_class=HTMLResponse)
async def landing_page():
    """Serve the landing page at root path."""
    return HTMLResponse(content=_LANDING_HTML_PATH.read_text(encoding="utf-8"), headers=_NO_STORE)


@router.get("/login", response_class=HTMLResponse)
async def login_page():
    """Serve the login/signup page."""
    return HTMLResponse(content=_LOGIN_HTML_PATH.read_text(encoding="utf-8"), headers=_NO_STORE)


@router.get("/admin", response_class=HTMLResponse)
async def admin_panel():
    """Serve the admin web panel."""
    return HTMLResponse(content=_ADMIN_HTML_PATH.read_text(encoding="utf-8"), headers=_NO_STORE)


@router.get("/dashboard", response_class=HTMLResponse)
async def user_dashboard():
    """Serve the user dashboard (separate from admin)."""
    return HTMLResponse(content=_DASHBOARD_HTML_PATH.read_text(encoding="utf-8"), headers=_NO_STORE)
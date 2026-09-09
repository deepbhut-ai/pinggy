"""Legacy page routes — kept as redirects to the React SPA.
The old static admin/login/dashboard HTML pages were removed (v2.7.0);
the React app at /dashboard (user) and /dashboard/admin (admin panel)
replaced them. / (landing) is still served from static/landing.html."""
from pathlib import Path

from fastapi import APIRouter
from starlette.responses import HTMLResponse, RedirectResponse

router = APIRouter(tags=["admin"])

_LANDING_HTML_PATH = Path(__file__).resolve().parents[2] / "static" / "landing.html"

# no-store prevents browser back/forward cache (bfcache) from showing
# logged-in pages after logout
_NO_STORE = {"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}


@router.get("/", response_class=HTMLResponse)
async def landing_page():
    """Serve the landing page at root path."""
    return HTMLResponse(content=_LANDING_HTML_PATH.read_text(encoding="utf-8"), headers=_NO_STORE)


@router.get("/admin", response_class=RedirectResponse)
async def admin_panel():
    """Old admin panel → React admin panel (admin-only route)."""
    return RedirectResponse(url="/dashboard/admin", status_code=307)
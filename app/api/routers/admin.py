"""Legacy page routes — kept as redirects to the React SPA.
The old static admin/login/dashboard HTML pages were removed (v2.7.0);
the React app at /dashboard (user) and /dashboard/admin (admin panel)
replaced them."""
from pathlib import Path

from fastapi import APIRouter
from starlette.responses import RedirectResponse

router = APIRouter(tags=["admin"])


@router.get("/admin", response_class=RedirectResponse)
async def admin_panel():
    """Old admin panel → React admin panel (admin-only route)."""
    return RedirectResponse(url="/dashboard/admin", status_code=307)
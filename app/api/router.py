"""Router aggregator."""
from fastapi import APIRouter

from app.api.routers import admin, analytics, announcements, audit, auth, invoices, ip_monitor, payments, plans, settings as settings_router, tokens, tunnels, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(tunnels.router)
api_router.include_router(tokens.router)
api_router.include_router(payments.router)
api_router.include_router(ip_monitor.router)
api_router.include_router(audit.router)
api_router.include_router(analytics.router)
api_router.include_router(settings_router.router)
api_router.include_router(announcements.router)
api_router.include_router(plans.router)
api_router.include_router(invoices.router)
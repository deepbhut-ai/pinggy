"""Router aggregator."""
from fastapi import APIRouter

from app.api.routers import admin, auth, tunnels, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(tunnels.router)
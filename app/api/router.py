"""Router aggregator."""
from fastapi import APIRouter

from app.api.routers import admin, auth, payments, tokens, tunnels, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(tunnels.router)
api_router.include_router(tokens.router)
api_router.include_router(payments.router)
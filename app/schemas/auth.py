"""Pydantic schemas for auth."""
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=4, max_length=128)
    full_name: str | None = Field(default=None, max_length=120)
    role: str = Field(default="user", max_length=20)


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: str = "user"
    tunnel_token: str | None = None
    custom_domain: str | None = None
    plan: str = "free"


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    tunnel_token: str | None = None
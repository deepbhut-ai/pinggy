"""Application configuration via pydantic-settings."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    APP_NAME: str = "pinggy"
    APP_ENV: str = "dev"
    APP_DEBUG: bool = True
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    # PostgreSQL
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "pinggy"
    DATABASE_URL: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/pinggy"
    )

    # JWT
    JWT_SECRET: str = "change-me-to-a-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # SSH Tunnel Server
    SSH_HOST: str = "0.0.0.0"
    SSH_PORT: int = 2222
    # Domain for tunnel subdomains (e.g. "pinggy.example.com" → abc123.pinggy.example.com)
    TUNNEL_DOMAIN: str = "localhost"
    # Port range for SSH reverse tunnels (allocated dynamically)
    TUNNEL_PORT_MIN: int = 10000
    TUNNEL_PORT_MAX: int = 20000
    # Free plan: tunnel auto-disconnect after this many minutes (like pinggy.io)
    FREE_TUNNEL_TIMEOUT_MINUTES: int = 60

    # ---- Payments / Subscriptions ----
    PRO_PRICE_INR: float = 199.0          # monthly price in INR
    PRO_PRICE_USD: float = 2.99           # monthly price in USD (paypal/stripe intl)
    # Base URL for payment success/cancel redirects (set in .env)
    PUBLIC_BASE_URL: str = "https://invitechsg.com"

    # Stripe (card payments)
    STRIPE_SECRET_KEY: str = ""            # sk_live_... / sk_test_...
    STRIPE_WEBHOOK_SECRET: str = ""        # whsec_...
    STRIPE_ENABLED: bool = False           # enable when key is set

    # PayPal
    PAYPAL_CLIENT_ID: str = ""
    PAYPAL_CLIENT_SECRET: str = ""
    PAYPAL_MODE: str = "sandbox"           # sandbox | live
    PAYPAL_ENABLED: bool = False

    # NowPayments (crypto)
    NOWPAYMENTS_API_KEY: str = ""
    NOWPAYMENTS_IPN_SECRET: str = ""
    NOWPAYMENTS_ENABLED: bool = False
    # HTTP proxy listen port (for subdomain-based routing; in production use 80/443)
    PROXY_PORT: int = 8080
    # Subdomain length (random string)
    SUBDOMAIN_LENGTH: int = 7

    @property
    def async_dsn(self) -> str:
        """psycopg3 async connection string (no +psycopg scheme)."""
        url = self.DATABASE_URL
        if url.startswith("postgresql+psycopg://"):
            url = url.replace("postgresql+psycopg://", "postgresql://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
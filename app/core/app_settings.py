"""Runtime app settings — DB-backed key/value store with .env fallback.

Priority: app_settings table value > .env/settings value. Secret values are
never returned in full by the admin API (masked).
"""
import logging
from typing import Any

from psycopg import AsyncConnection

from app.core.config import settings as env_settings

logger = logging.getLogger("app_settings")

# Keys the admin Settings page may manage. (key, is_secret, env_attr, label)
SETTING_DEFS: list[tuple[str, bool, str, str]] = [
    ("stripe_secret_key", True, "STRIPE_SECRET_KEY", "Stripe Secret Key"),
    ("stripe_webhook_secret", True, "STRIPE_WEBHOOK_SECRET", "Stripe Webhook Secret"),
    ("stripe_enabled", False, "STRIPE_ENABLED", "Stripe Enabled"),
    ("paypal_client_id", True, "PAYPAL_CLIENT_ID", "PayPal Client ID"),
    ("paypal_client_secret", True, "PAYPAL_CLIENT_SECRET", "PayPal Client Secret"),
    ("paypal_mode", False, "PAYPAL_MODE", "PayPal Mode (sandbox|live)"),
    ("paypal_enabled", False, "PAYPAL_ENABLED", "PayPal Enabled"),
    ("nowpayments_api_key", True, "NOWPAYMENTS_API_KEY", "NowPayments API Key"),
    ("nowpayments_ipn_secret", True, "NOWPAYMENTS_IPN_SECRET", "NowPayments IPN Secret"),
    ("nowpayments_enabled", False, "NOWPAYMENTS_ENABLED", "NowPayments Enabled"),
    ("public_base_url", False, "PUBLIC_BASE_URL", "Public Base URL (redirects)"),
    ("pro_price_inr", False, "PRO_PRICE_INR", "Pro price INR"),
    ("pro_price_usd", False, "PRO_PRICE_USD", "Pro price USD"),
]


async def get_setting(db: AsyncConnection, key: str, default: Any = None) -> Any:
    """DB value if row exists, else env default, else `default`."""
    try:
        cur = await db.execute(
            "SELECT value FROM app_settings WHERE key = %s", (key,)
        )
        row = await cur.fetchone()
        await cur.close()
        if row is not None and row[0] is not None and row[0] != "":
            return row[0]
    except Exception as e:
        logger.debug("get_setting(%s) db error: %s", key, e)
    # env fallback
    for k, _secret, env_attr, _label in SETTING_DEFS:
        if k == key:
            return getattr(env_settings, env_attr, None)
    return default


async def set_setting(db: AsyncConnection, key: str, value: str, updated_by: str = "") -> None:
    cur = await db.execute(
        """
        INSERT INTO app_settings (key, value, updated_by, updated_at)
        VALUES (%s, %s, %s, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
        """,
        (key, value, updated_by),
    )
    await cur.close()


async def payment_method_enabled(db: AsyncConnection, method: str) -> bool:
    """Stripe/PayPal/NowPayments enabled check: explicit flag wins, else key presence."""
    key_map = {
        "stripe": ("stripe_enabled", "stripe_secret_key"),
        "paypal": ("paypal_enabled", "paypal_client_id"),
        "nowpayments": ("nowpayments_enabled", "nowpayments_api_key"),
    }
    flag_key, secret_key = key_map[method]
    flag = await get_setting(db, flag_key)
    if isinstance(flag, str):
        return flag.lower() in ("1", "true", "yes", "on")
    if isinstance(flag, bool):
        return flag
    secret = await get_setting(db, secret_key)
    return bool(secret and str(secret).strip())

"""Payments router — subscriptions via Stripe, PayPal, NowPayments.

Flow:
1. POST /payments/checkout {method, plan} → creates a `payments` row and
   returns a payment URL (Stripe Checkout / PayPal approve link / NP invoice).
2. Gateway redirects the user back to /dashboard?payment=success|cancel.
3. Gateway calls the webhook → we verify → mark payment paid →
   set users.plan='pro' + users.plan_expires_at=+30 days.
"""
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from psycopg import AsyncConnection

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_user

router = APIRouter(prefix="/payments", tags=["payments"])

MONTH_DAYS = 30


def _method_enabled(method: str) -> bool:
    return {
        "stripe": settings.STRIPE_ENABLED,
        "paypal": settings.PAYPAL_ENABLED,
        "nowpayments": settings.NOWPAYMENTS_ENABLED,
    }.get(method, False)


async def _create_payment_row(
    db: AsyncConnection, email: str, method: str, plan: str, amount: float, currency: str, ref: str
) -> str:
    cur = await db.execute(
        """INSERT INTO payments (user_email, method, plan, amount, currency, status, provider_ref)
           VALUES (%s, %s, %s, %s, %s, 'pending', %s) RETURNING id""",
        (email, method, plan, amount, currency, ref),
    )
    row = await cur.fetchone()
    await cur.close()
    return str(row[0])


async def _mark_paid_and_upgrade(db: AsyncConnection, provider_ref: str, payload: dict | None, seats: int = 1) -> bool:
    """Mark payment paid and upgrade the user to pro. Returns True on success."""
    cur = await db.execute(
        "SELECT id, user_email, status FROM payments WHERE provider_ref = %s",
        (provider_ref,),
    )
    pay = await cur.fetchone()
    await cur.close()
    if not pay:
        return False
    payment_id, email, cur_status = pay[0], pay[1], pay[2]
    if cur_status == "paid":
        return True  # already processed (webhook retries)

    cur = await db.execute(
        "UPDATE payments SET status='paid', updated_at=now(), provider_payload=%s WHERE id=%s",
        (json.dumps(payload) if payload else None, payment_id),
    )
    await cur.close()

    # Extend from current expiry or from now; increase seats (max of current/new)
    cur = await db.execute(
        """UPDATE users
           SET plan = 'pro',
               seats = GREATEST(seats, %s),
               plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + interval '1 month',
               updated_at = now()
           WHERE email = %s RETURNING plan_expires_at""",
        (seats, email),
    )
    row = await cur.fetchone()
    await cur.close()
    print(f"[payments] {email} upgraded to pro (seats={seats}, ref={provider_ref}, expires={row[0]})")
    return True


# ---------------------------------------------------------------- checkout
class CheckoutIn(dict):
    pass


@router.post("/checkout")
async def create_checkout(
    body: dict,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a payment for a plan. body: {method, plan, seats?, cycle?}"""
    method = (body.get("method") or "").lower()
    plan = (body.get("plan") or "pro").lower()
    seats = max(1, int(body.get("seats") or 1))
    cycle = (body.get("cycle") or "monthly").lower()
    if plan != "pro":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only 'pro' plan is purchasable right now")
    if method not in ("stripe", "paypal", "nowpayments"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "method must be stripe, paypal or nowpayments")
    if not _method_enabled(method):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"{method} payments are not configured yet. Contact support.",
        )

    # Price scales with seats; yearly = 12 months for price of 10 (save 17%)
    months = 12 if cycle == "yearly" else 1
    inr_amount = round(settings.PRO_PRICE_INR * seats * (10 if months == 12 else 1), 2)
    usd_amount = round(settings.PRO_PRICE_USD * seats * (10 if months == 12 else 1), 2)

    if method == "stripe":
        return await _stripe_checkout(user["email"], plan, db, seats, inr_amount)
    if method == "paypal":
        return await _paypal_checkout(user["email"], plan, db, seats, usd_amount)
    return await _nowpayments_checkout(user["email"], plan, db, seats, usd_amount)


# Pending seats per payment ref: provider_ref -> seats (used when webhook upgrades)
_PENDING_SEATS_MAP: dict = {}


# ---------------------------------------------------------------- Stripe
async def _stripe_checkout(email: str, plan: str, db: AsyncConnection) -> dict:
    """Create a Stripe Checkout Session via REST (no SDK needed)."""
    url = "https://api.stripe.com/v1/checkout/sessions"
    data = {
        "mode": "payment",
        "success_url": f"{settings.PUBLIC_BASE_URL}/dashboard?payment=success",
        "cancel_url": f"{settings.PUBLIC_BASE_URL}/dashboard?payment=cancel",
        "customer_email": email,
        "line_items[0][price_data][currency]": "inr",
        "line_items[0][price_data][unit_amount]": str(int(settings.PRO_PRICE_INR * 100)),
        "line_items[0][price_data][product_data][name]": "Tunnel Pro (1 month)",
        "line_items[0][quantity]": "1",
        "metadata[plan]": plan,
        "metadata[email]": email,
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            url,
            data=data,
            auth=(settings.STRIPE_SECRET_KEY, ""),
            timeout=30,
        )
    if r.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Stripe error: {r.text[:300]}")
    session = r.json()
    await _create_payment_row(db, email, "stripe", plan, settings.PRO_PRICE_INR, "INR", session["id"])
    return {"method": "stripe", "url": session["url"], "ref": session["id"]}


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request, db: AsyncConnection = Depends(get_db)):
    """Verify Stripe signature and confirm payment."""
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    if settings.STRIPE_WEBHOOK_SECRET:
        try:
            import stripe as _stripe  # optional; fall back to manual verify below
            _stripe.Webhook.construct_event(payload, sig, settings.STRIPE_WEBHOOK_SECRET)
        except ImportError:
            # Manual signature check: v1=HMAC-SHA256(secret, "{t}.{payload}")
            if not _verify_stripe_sig(payload, sig, settings.STRIPE_WEBHOOK_SECRET):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Stripe signature")
        except Exception:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Stripe signature")

    event = json.loads(payload)
    if event.get("type") == "checkout.session.completed":
        session = event["data"]["object"]
        ok = await _mark_paid_and_upgrade(db, session["id"], session)
        return {"received": True, "upgraded": ok}
    return {"received": True}


def _verify_stripe_sig(payload: bytes, sig_header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
    t, v1 = parts.get("t"), parts.get("v1")
    if not t or not v1:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


# ---------------------------------------------------------------- PayPal
async def _paypal_token() -> str:
    base = "https://api-m.sandbox.paypal.com" if settings.PAYPAL_MODE == "sandbox" else "https://api-m.paypal.com"
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{base}/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET),
            headers={"Accept": "application/json"},
            timeout=30,
        )
    if r.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"PayPal auth failed: {r.text[:200]}")
    return r.json()["access_token"]


async def _paypal_checkout(email: str, plan: str, db: AsyncConnection) -> dict:
    token = await _paypal_token()
    base = "https://api-m.sandbox.paypal.com" if settings.PAYPAL_MODE == "sandbox" else "https://api-m.paypal.com"
    order = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": f"{email}:{plan}",
            "amount": {"currency_code": "USD", "value": f"{settings.PRO_PRICE_USD:.2f}"},
            "description": "Tunnel Pro (1 month)",
            "custom_id": email,
        }],
        "application_context": {
            "brand_name": "Tunnel",
            "user_action": "PAY_NOW",
            "return_url": f"{settings.PUBLIC_BASE_URL}/dashboard?payment=success",
            "cancel_url": f"{settings.PUBLIC_BASE_URL}/dashboard?payment=cancel",
        },
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{base}/v2/checkout/orders",
            json=order,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=30,
        )
    if r.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"PayPal error: {r.text[:300]}")
    data = r.json()
    approve = next((l["href"] for l in data.get("links", []) if l.get("rel") == "approve"), None)
    if not approve:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "PayPal: no approve link")
    await _create_payment_row(db, email, "paypal", plan, settings.PRO_PRICE_USD, "USD", data["id"])
    return {"method": "paypal", "url": approve, "ref": data["id"]}


@router.post("/webhook/paypal")
async def paypal_webhook(request: Request, db: AsyncConnection = Depends(get_db)):
    """PayPal webhook (CHECKOUT.ORDER.APPROVED / PAYMENT.CAPTURE.COMPLETED).
    NOTE: full transmission verification requires PayPal's verify-signature API;
    for production, call /v1/notifications/verify-webhook-signature here."""
    event = await request.json()
    etype = event.get("event_type", "")
    if etype in ("CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED"):
        resource = event.get("resource", {})
        ref = resource.get("id") or resource.get("supplementary_data", {}).get("related_ids", {}).get("order_id")
        if ref:
            ok = await _mark_paid_and_upgrade(db, ref, event)
            return {"received": True, "upgraded": ok}
    return {"received": True}


@router.get("/paypal/capture/{order_id}")
async def paypal_capture(
    order_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Fallback capture (if webhooks not configured): user returns → we capture the order."""
    token = await _paypal_token()
    base = "https://api-m.sandbox.paypal.com" if settings.PAYPAL_MODE == "sandbox" else "https://api-m.paypal.com"
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{base}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=30,
        )
    if r.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"PayPal capture failed: {r.text[:300]}")
    ok = await _mark_paid_and_upgrade(db, order_id, r.json())
    return {"captured": True, "upgraded": ok}


# ---------------------------------------------------------------- NowPayments (crypto)
async def _nowpayments_checkout(email: str, plan: str, db: AsyncConnection) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.nowpayments.io/v1/invoice",
            json={
                "price_amount": settings.PRO_PRICE_USD,
                "price_currency": "usd",
                "order_id": f"{email}-{int(datetime.now(timezone.utc).timestamp())}",
                "order_description": f"Tunnel Pro (1 month) — {email}",
                "ipn_callback_url": f"{settings.PUBLIC_BASE_URL}/api/v1/payments/webhook/nowpayments",
                "success_url": f"{settings.PUBLIC_BASE_URL}/dashboard?payment=success",
                "cancel_url": f"{settings.PUBLIC_BASE_URL}/dashboard?payment=cancel",
            },
            headers={"x-api-key": settings.NOWPAYMENTS_API_KEY, "Content-Type": "application/json"},
            timeout=30,
        )
    if r.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"NowPayments error: {r.text[:300]}")
    data = r.json()
    await _create_payment_row(db, email, "nowpayments", plan, settings.PRO_PRICE_USD, "USD", data["id"])
    return {"method": "nowpayments", "url": data["invoice_url"], "ref": data["id"]}


@router.post("/webhook/nowpayments")
async def nowpayments_webhook(request: Request, db: AsyncConnection = Depends(get_db)):
    """NowPayments IPN callback. Verify x-nowpayments-sig header (HMAC-SHA256 of sorted JSON)."""
    payload = await request.body()
    if settings.NOWPAYMENTS_IPN_SECRET:
        sig = request.headers.get("x-nowpayments-sig", "")
        try:
            parsed = json.loads(payload)
            sorted_str = json.dumps(parsed, sort_keys=True, separators=(",", ":"))
            # NP uses sorted JSON without spaces
            expected = hmac.new(
                settings.NOWPAYMENTS_IPN_SECRET.encode(), sorted_str.encode(), hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(expected, sig):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid NowPayments signature")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Signature check failed")

    data = json.loads(payload)
    if data.get("payment_status") == "finished":
        ref = str(data.get("payment_id"))
        ok = await _mark_paid_and_upgrade(db, ref, data)
        return {"received": True, "upgraded": ok}
    return {"received": True}


# ---------------------------------------------------------------- status / history
@router.get("/my")
async def my_payments(
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Payment history + current subscription status for the logged-in user."""
    cur = await db.execute(
        """SELECT method, plan, amount, currency, status, created_at
           FROM payments WHERE user_email = %s ORDER BY created_at DESC LIMIT 20""",
        (user["email"],),
    )
    rows = await cur.fetchall()
    await cur.close()
    return {
        "plan": getattr(user, "get", lambda k: None)("plan") or "free",
        "enabled": {
            "stripe": settings.STRIPE_ENABLED,
            "paypal": settings.PAYPAL_ENABLED,
            "nowpayments": settings.NOWPAYMENTS_ENABLED,
        },
        "price_inr": settings.PRO_PRICE_INR,
        "price_usd": settings.PRO_PRICE_USD,
        "history": [
            {
                "method": r[0], "plan": r[1], "amount": float(r[2]),
                "currency": r[3], "status": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
            }
            for r in rows
        ],
    }
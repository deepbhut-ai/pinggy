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
from app.core.deps import get_admin_user, get_current_user

router = APIRouter(prefix="/payments", tags=["payments"])

MONTH_DAYS = 30


async def _apply_coupon(db: AsyncConnection, code: str) -> int:
    """Validate a coupon code and return its percent_off. Raises on invalid.
    Does NOT increment redemption here — that happens on payment success."""
    cur = await db.execute(
        "SELECT percent_off, active, expires_at, max_redemptions, redeemed FROM coupons WHERE code = %s",
        (code.strip().upper(),),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row or not row[1]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid or inactive coupon code")
    if row[2] and row[2] < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_410_GONE, "Coupon has expired")
    if row[3] and row[4] >= row[3]:
        raise HTTPException(status.HTTP_410_GONE, "Coupon redemption limit reached")
    return int(row[0])


async def _get_setting(db: AsyncConnection, key: str, default=None):
    from app.core.app_settings import get_setting
    return await get_setting(db, key, default)


async def _method_enabled(db: AsyncConnection, method: str) -> bool:
    from app.core.app_settings import payment_method_enabled
    return await payment_method_enabled(db, method)


async def _create_payment_row(
    db: AsyncConnection, email: str, method: str, plan: str, amount: float, currency: str, ref: str,
    coupon_code: str | None = None,
) -> str:
    try:
        cur = await db.execute(
            """INSERT INTO payments (user_email, method, plan, amount, currency, status, provider_ref, coupon_code)
               VALUES (%s, %s, %s, %s, %s, 'pending', %s, %s) RETURNING id""",
            (email, method, plan, amount, currency, ref, coupon_code or None),
        )
    except Exception:
        # coupon_code column may not exist yet (pre-0013 migration) — insert without it
        cur = await db.execute(
            """INSERT INTO payments (user_email, method, plan, amount, currency, status, provider_ref)
               VALUES (%s, %s, %s, %s, %s, 'pending', %s) RETURNING id""",
            (email, method, plan, amount, currency, ref),
        )
    row = await cur.fetchone()
    await cur.close()
    return str(row[0])


async def _mark_paid_and_upgrade(db: AsyncConnection, provider_ref: str, payload: dict | None, seats: int = 1) -> bool:
    """Mark payment paid, upgrade user to pro, redeem any coupon tied to the row. True on success."""
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
    # Redeem coupon if one was recorded on the payment row (coupon_code column, Phase E-safe: ignore if absent)
    try:
        cur = await db.execute("SELECT coupon_code FROM payments WHERE id = %s", (payment_id,))
        prow = await cur.fetchone()
        await cur.close()
        code = prow[0] if prow else None
        if code:
            cur = await db.execute(
                "UPDATE coupons SET redeemed = redeemed + 1 WHERE code = %s", (code,)
            )
            await cur.close()
    except Exception:
        pass  # coupons column may not exist yet — ignore
    # Auto-create invoice for the paid payment (Job 8) — idempotent
    try:
        from app.api.routers.invoices import create_invoice_for_payment
        await create_invoice_for_payment(db, payment_id)
    except Exception as e:
        print(f"[payments] invoice creation skipped: {e}")
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
    """Create a payment for a plan. body: {method, plan, seats?, cycle?, coupon?}"""
    method = (body.get("method") or "").lower()
    plan = (body.get("plan") or "pro").lower()
    seats = max(1, int(body.get("seats") or 1))
    cycle = (body.get("cycle") or "monthly").lower()
    coupon_code = (body.get("coupon") or "").strip()
    if plan != "pro":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only 'pro' plan is purchasable right now")
    if method not in ("stripe", "paypal", "nowpayments"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "method must be stripe, paypal or nowpayments")
    if not await _method_enabled(db, method):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"{method} payments are not configured yet. Contact support.",
        )

    # Prices from runtime settings (DB override > env)
    pro_inr = float(await _get_setting(db, "pro_price_inr", settings.PRO_PRICE_INR))
    pro_usd = float(await _get_setting(db, "pro_price_usd", settings.PRO_PRICE_USD))

    # Price scales with seats; yearly = 12 months for price of 10 (save 17%)
    months = 12 if cycle == "yearly" else 1
    inr_amount = round(pro_inr * seats * (10 if months == 12 else 1), 2)
    usd_amount = round(pro_usd * seats * (10 if months == 12 else 1), 2)

    # Coupon discount (percent off the computed total)
    if coupon_code:
        pct = await _apply_coupon(db, coupon_code)
        inr_amount = round(inr_amount * (100 - pct) / 100, 2)
        usd_amount = round(usd_amount * (100 - pct) / 100, 2)

    if method == "stripe":
        return await _stripe_checkout(user["email"], plan, db, seats, inr_amount, coupon=coupon_code)
    if method == "paypal":
        return await _paypal_checkout(user["email"], plan, db, seats, usd_amount, coupon=coupon_code)
    return await _nowpayments_checkout(user["email"], plan, db, seats, usd_amount, coupon=coupon_code)


@router.post("/coupon/validate")
async def validate_coupon_endpoint(
    body: dict,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Validate a coupon and return the discounted preview for a plan config."""
    code = (body.get("code") or "").strip()
    seats = max(1, int(body.get("seats") or 1))
    cycle = (body.get("cycle") or "monthly").lower()
    if not code:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "code required")
    pct = await _apply_coupon(db, code)
    pro_inr = float(await _get_setting(db, "pro_price_inr", settings.PRO_PRICE_INR))
    months = 12 if cycle == "yearly" else 1
    base = round(pro_inr * seats * (10 if months == 12 else 1), 2)
    return {
        "code": code.strip().upper(),
        "percent_off": pct,
        "base_inr": base,
        "discounted_inr": round(base * (100 - pct) / 100, 2),
    }


# Pending seats per payment ref: provider_ref -> seats (used when webhook upgrades)
_PENDING_SEATS_MAP: dict = {}


# ---------------------------------------------------------------- Stripe
async def _stripe_checkout(email: str, plan: str, db: AsyncConnection, seats: int = 1, inr_amount: float = None, coupon: str = "") -> dict:
    """Create a Stripe Checkout Session via REST (no SDK needed)."""
    if inr_amount is None:
        inr_amount = settings.PRO_PRICE_INR
    base_url = await _get_setting(db, "public_base_url", settings.PUBLIC_BASE_URL)
    secret = await _get_setting(db, "stripe_secret_key", settings.STRIPE_SECRET_KEY)
    url = "https://api.stripe.com/v1/checkout/sessions"
    data = {
        "mode": "payment",
        "success_url": f"{base_url}/dashboard?payment=success",
        "cancel_url": f"{base_url}/dashboard?payment=cancel",
        "customer_email": email,
        "line_items[0][price_data][currency]": "inr",
        "line_items[0][price_data][unit_amount]": str(int(inr_amount * 100)),
        "line_items[0][price_data][product_data][name]": f"Tunnel Pro ({seats} seat{'s' if seats > 1 else ''})",
        "line_items[0][quantity]": "1",
        "metadata[plan]": plan,
        "metadata[email]": email,
        "metadata[seats]": str(seats),
    }
    if coupon:
        data["metadata[coupon]"] = coupon.strip().upper()
    async with httpx.AsyncClient() as client:
        r = await client.post(
            url,
            data=data,
            auth=(secret, ""),
            timeout=30,
        )
    if r.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Stripe error: {r.text[:300]}")
    session = r.json()
    await _create_payment_row(db, email, "stripe", plan, inr_amount, "INR", session["id"], coupon_code=coupon)
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
async def _paypal_token(db: AsyncConnection) -> str:
    mode = await _get_setting(db, "paypal_mode", settings.PAYPAL_MODE)
    base = "https://api-m.sandbox.paypal.com" if mode == "sandbox" else "https://api-m.paypal.com"
    cid = await _get_setting(db, "paypal_client_id", settings.PAYPAL_CLIENT_ID)
    csecret = await _get_setting(db, "paypal_client_secret", settings.PAYPAL_CLIENT_SECRET)
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{base}/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            auth=(cid, csecret),
            headers={"Accept": "application/json"},
            timeout=30,
        )
    if r.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"PayPal auth failed: {r.text[:200]}")
    return r.json()["access_token"]


async def _paypal_checkout(email: str, plan: str, db: AsyncConnection, seats: int = 1, usd_amount: float = None, coupon: str = "") -> dict:
    if usd_amount is None:
        usd_amount = settings.PRO_PRICE_USD
    mode = await _get_setting(db, "paypal_mode", settings.PAYPAL_MODE)
    base_url = await _get_setting(db, "public_base_url", settings.PUBLIC_BASE_URL)
    token = await _paypal_token(db)
    base = "https://api-m.sandbox.paypal.com" if mode == "sandbox" else "https://api-m.paypal.com"
    order = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": f"{email}:{plan}",
            "amount": {"currency_code": "USD", "value": f"{usd_amount:.2f}"},
            "description": f"Tunnel Pro ({seats} seat{'s' if seats > 1 else ''})",
            "custom_id": email,
        }],
        "application_context": {
            "brand_name": "Tunnel",
            "user_action": "PAY_NOW",
            "return_url": f"{base_url}/dashboard?payment=success",
            "cancel_url": f"{base_url}/dashboard?payment=cancel",
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
    await _create_payment_row(db, email, "paypal", plan, usd_amount, "USD", data["id"], coupon_code=coupon)
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
    token = await _paypal_token(db)
    mode = await _get_setting(db, "paypal_mode", settings.PAYPAL_MODE)
    base = "https://api-m.sandbox.paypal.com" if mode == "sandbox" else "https://api-m.paypal.com"
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
async def _nowpayments_checkout(email: str, plan: str, db: AsyncConnection, seats: int = 1, usd_amount: float = None, coupon: str = "") -> dict:
    if usd_amount is None:
        usd_amount = settings.PRO_PRICE_USD
    base_url = await _get_setting(db, "public_base_url", settings.PUBLIC_BASE_URL)
    api_key = await _get_setting(db, "nowpayments_api_key", settings.NOWPAYMENTS_API_KEY)
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.nowpayments.io/v1/invoice",
            json={
                "price_amount": usd_amount,
                "price_currency": "usd",
                "order_id": f"{email}-{int(datetime.now(timezone.utc).timestamp())}",
                "order_description": f"Tunnel Pro ({seats} seat{'s' if seats > 1 else ''}) — {email}",
                "ipn_callback_url": f"{base_url}/api/v1/payments/webhook/nowpayments",
                "success_url": f"{base_url}/dashboard?payment=success",
                "cancel_url": f"{base_url}/dashboard?payment=cancel",
            },
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
            timeout=30,
        )
    if r.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"NowPayments error: {r.text[:300]}")
    data = r.json()
    await _create_payment_row(db, email, "nowpayments", plan, usd_amount, "USD", data["id"], coupon_code=coupon)
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


# ================================================================
# Admin endpoints — admin-only, view all payments
# ================================================================

@router.get("/admin/all")
async def admin_list_all_payments(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    limit: int = 200,
):
    """List all payments across all users (admin only)."""
    cur = await db.execute(
        """SELECT id, user_email, method, plan, amount, currency, status,
                  provider_ref, created_at, updated_at
           FROM payments ORDER BY created_at DESC LIMIT %s""",
        (limit,),
    )
    rows = await cur.fetchall()
    await cur.close()
    return {
        "total": len(rows),
        "payments": [
            {
                "id": str(r[0]),
                "user_email": r[1],
                "method": r[2],
                "plan": r[3],
                "amount": float(r[4]),
                "currency": r[5],
                "status": r[6],
                "provider_ref": r[7],
                "created_at": r[8].isoformat() if r[8] else None,
                "updated_at": r[9].isoformat() if r[9] else None,
            }
            for r in rows
        ],
    }


@router.get("/admin/stats")
async def admin_payment_stats(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    """Payment statistics (admin only)."""
    # Total revenue (paid only)
    cur = await db.execute(
        "SELECT COALESCE(SUM(amount), 0), currency FROM payments WHERE status = 'paid' GROUP BY currency"
    )
    revenue_rows = await cur.fetchall()
    await cur.close()
    revenue_by_currency = {r[1]: float(r[0]) for r in revenue_rows}

    # Counts by status
    cur = await db.execute(
        "SELECT status, COUNT(*) FROM payments GROUP BY status"
    )
    status_rows = await cur.fetchall()
    await cur.close()
    status_counts = {r[0]: r[1] for r in status_rows}

    # Counts by method
    cur = await db.execute(
        "SELECT method, COUNT(*) FROM payments GROUP BY method"
    )
    method_rows = await cur.fetchall()
    await cur.close()
    method_counts = {r[0]: r[1] for r in method_rows}

    # Total payments
    cur = await db.execute("SELECT COUNT(*) FROM payments")
    total = (await cur.fetchone())[0]
    await cur.close()

    return {
        "total_payments": total,
        "revenue": revenue_by_currency,
        "by_status": status_counts,
        "by_method": method_counts,
    }
"""Invoices router — auto-created when payments turn paid; list + printable view (Job 8)."""
import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection

from app.core.audit import log_audit
from app.core.db import get_db
from app.core.deps import get_admin_user, get_current_user

router = APIRouter(prefix="/invoices", tags=["invoices"])

_COLS = "id, invoice_no, user_email, payment_id, plan, seats, coupon_code, amount, currency, status, issued_at"


def _row(r) -> dict:
    return {
        "id": str(r[0]), "invoice_no": r[1], "user_email": r[2],
        "payment_id": str(r[3]) if r[3] else None,
        "plan": r[4], "seats": r[5], "coupon_code": r[6],
        "amount": float(r[7]), "currency": r[8], "status": r[9],
        "issued_at": r[10].isoformat() if r[10] else None,
    }


async def create_invoice_for_payment(db: AsyncConnection, payment_id) -> None:
    """Called after a payment is marked paid. Idempotent (one invoice per payment)."""
    cur = await db.execute("SELECT 1 FROM invoices WHERE payment_id = %s", (payment_id,))
    if await cur.fetchone():
        await cur.close()
        return
    await cur.close()
    cur = await db.execute(
        "SELECT user_email, plan, amount, currency, coupon_code FROM payments WHERE id = %s AND status = 'paid'",
        (payment_id,),
    )
    pay = await cur.fetchone()
    await cur.close()
    if not pay:
        return
    email, plan, amount, currency, coupon = pay
    seats = 1
    try:
        cur = await db.execute("SELECT seats FROM users WHERE email = %s", (email,))
        urow = await cur.fetchone()
        await cur.close()
        if urow:
            seats = urow[0] or 1
    except Exception:
        pass
    now = datetime.datetime.now(datetime.timezone.utc)
    invoice_no = f"INV-{now.strftime('%Y%m')}-{str(payment_id)[:8].upper()}"
    cur = await db.execute(
        """INSERT INTO invoices (invoice_no, user_email, payment_id, plan, seats, coupon_code, amount, currency)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (payment_id) DO NOTHING""",
        (invoice_no, email, payment_id, plan, seats, coupon, amount, currency),
    )
    await cur.close()


@router.get("/my")
async def my_invoices(
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        f"SELECT {_COLS} FROM invoices WHERE user_email = %s ORDER BY issued_at DESC",
        (user["email"],),
    )
    rows = await cur.fetchall()
    await cur.close()
    return [_row(r) for r in rows]


@router.get("/admin/all")
async def admin_all_invoices(
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
    limit: int = Query(200, ge=1, le=1000),
    status_filter: str | None = Query(None, alias="status"),
):
    q = f"SELECT {_COLS} FROM invoices"
    params: list = []
    if status_filter:
        q += " WHERE status = %s"
        params.append(status_filter)
    q += " ORDER BY issued_at DESC LIMIT %s"
    params.append(limit)
    cur = await db.execute(q, tuple(params))
    rows = await cur.fetchall()
    await cur.close()
    return [_row(r) for r in rows]


@router.get("/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(f"SELECT {_COLS} FROM invoices WHERE id = %s OR invoice_no = %s",
                           (invoice_id, invoice_id))
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    inv = _row(row)
    # users may only view their own; admins see all
    if user["role"] != "admin" and inv["user_email"] != user["email"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your invoice")
    return inv


@router.post("/{invoice_id}/void")
async def void_invoice(
    invoice_id: str,
    admin: dict = Depends(get_admin_user),
    db: AsyncConnection = Depends(get_db),
):
    cur = await db.execute(
        "UPDATE invoices SET status = 'void' WHERE id = %s AND status = 'paid' RETURNING invoice_no",
        (invoice_id,),
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found (or not voidable)")
    await log_audit(db, admin["email"], "invoice.void", row[0], "invoice voided")
    return {"detail": f"Invoice {row[0]} voided"}


@router.get("/{invoice_id}/print")
async def print_invoice(
    invoice_id: str,
    token: str,
    db: AsyncConnection = Depends(get_db),
):
    """Printable invoice page (opens in a new tab; JWT passed as ?token=)."""
    from app.core.deps import get_current_user as _gpu
    from fastapi import Depends as _D
    from fastapi.security import HTTPAuthorizationCredentials as _Creds
    creds = _Creds(scheme="Bearer", credentials=token)
    from app.core.security import decode_credentials
    payload = decode_credentials(creds)
    user_id = payload.get("sub")
    cur = await db.execute(
        f"SELECT {_COLS} FROM invoices WHERE id = %s OR invoice_no = %s", (invoice_id, invoice_id)
    )
    row = await cur.fetchone()
    await cur.close()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    inv = _row(row)
    cur = await db.execute("SELECT email, role FROM users WHERE id = %s", (user_id,))
    u = await cur.fetchone()
    await cur.close()
    if not u or (u[1] != "admin" and u[0] != inv["user_email"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your invoice")
    sym = "₹" if inv["currency"] == "INR" else "$"
    html = f"""<!DOCTYPE html>
<html><head><title>Invoice {inv['invoice_no']}</title>
<style>
  body {{ font-family: -apple-system, 'Segoe UI', sans-serif; color: #1e293b; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }}
  .head {{ display:flex; justify-content:space-between; border-bottom:2px solid #6366f1; padding-bottom:1rem; }}
  h1 {{ font-size:1.4rem; margin:0; }} .muted {{ color:#64748b; font-size:.85rem; }}
  table {{ width:100%; border-collapse:collapse; margin-top:1.5rem; }}
  td, th {{ padding:.55rem .5rem; border-bottom:1px solid #e2e8f0; text-align:left; font-size:.92rem; }}
  .total {{ font-size:1.15rem; font-weight:700; }}
  .badge {{ display:inline-block; padding:.15rem .6rem; border-radius:99px; background:#dcfce7; color:#166534; font-size:.78rem; font-weight:600; }}
  @media print {{ .noprint {{ display:none; }} }}
</style></head><body>
<div class="head">
  <div><h1>⚡ IRAGT</h1><div class="muted">Secure tunnels to localhost</div></div>
  <div style="text-align:right"><strong>INVOICE</strong><br><span class="muted">{inv['invoice_no']}</span><br>
  <span class="muted">{inv['issued_at'][:10] if inv['issued_at'] else ''}</span></div>
</div>
<table>
  <tr><th>Billed to</th><td>{inv['user_email']}</td></tr>
  <tr><th>Plan</th><td>{inv['plan']} — {inv['seats']} seat(s)</td></tr>
  <tr><th>Coupon</th><td>{inv['coupon_code'] or '—'}</td></tr>
  <tr><th>Payment reference</th><td class="muted">{inv['payment_id'] or '—'}</td></tr>
  <tr><th>Status</th><td><span class="badge">{inv['status'].upper()}</span></td></tr>
  <tr><th>Total</th><td class="total">{sym}{inv['amount']}</td></tr>
</table>
<p class="muted" style="margin-top:2rem">Thank you for your business. This invoice was generated automatically.</p>
<button class="noprint" onclick="window.print()" style="margin-top:1rem;padding:.5rem 1.2rem;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer">🖨️ Print</button>
</body></html>"""
    from fastapi.responses import HTMLResponse
    return HTMLResponse(html)

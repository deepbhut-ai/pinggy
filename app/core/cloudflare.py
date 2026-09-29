"""Cloudflare DNS automation for multi-region edge nodes."""
import logging
from typing import Any
import httpx
from app.core.config import settings

logger = logging.getLogger("cloudflare")

CF_API_BASE = "https://api.cloudflare.com/client/v4"


async def get_cf_credentials(db: Any = None) -> tuple[str, str]:
    """Retrieve Cloudflare API token and Zone ID from settings or database."""
    token = settings.CLOUDFLARE_API_TOKEN or ""
    zone_id = settings.CLOUDFLARE_ZONE_ID or ""

    if (not token or not zone_id) and db:
        try:
            cur = await db.execute(
                "SELECT key, value FROM app_settings WHERE key IN ('cf_api_token', 'cf_zone_id')"
            )
            rows = await cur.fetchall()
            await cur.close()
            for k, v in rows:
                if k == "cf_api_token" and v:
                    token = v.strip()
                elif k == "cf_zone_id" and v:
                    zone_id = v.strip()
        except Exception:
            pass

    return token, zone_id


async def sync_region_dns(
    code: str,
    server_ip: str,
    db: Any = None,
    base_domain: str | None = None,
) -> dict[str, Any]:
    """Ensure {code}.ssh.{domain} and *.{code}.{domain} A records exist in Cloudflare.

    - {code}.ssh.{domain} -> server_ip (Proxied: False for raw SSH TCP port 2222)
    - *.{code}.{domain}   -> server_ip (Proxied: True for auto HTTPS/SSL wildcard)
    """
    domain = base_domain or settings.TUNNEL_DOMAIN
    ssh_name = f"{code}.ssh.{domain}"
    proxy_name = f"*.{code}.{domain}"

    expected_records = [
        {"name": ssh_name, "type": "A", "content": server_ip, "proxied": False, "ttl": 1},
        {"name": proxy_name, "type": "A", "content": server_ip, "proxied": True, "ttl": 1},
    ]

    token, zone_id = await get_cf_credentials(db)
    if not token or not zone_id:
        return {
            "synced": False,
            "configured": False,
            "message": "Cloudflare API token not configured. Records must be created manually.",
            "records": expected_records,
        }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    results = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1. Fetch existing records for this zone to avoid duplicate errors
            resp = await client.get(f"{CF_API_BASE}/zones/{zone_id}/dns_records?per_page=100", headers=headers)
            if resp.status_code != 200:
                logger.warning("Failed to fetch Cloudflare DNS records: %s", resp.text)
                return {
                    "synced": False,
                    "configured": True,
                    "error": f"Cloudflare API returned status {resp.status_code}",
                    "records": expected_records,
                }

            existing_records = {
                r["name"].lower(): r for r in resp.json().get("result", []) if r.get("type") == "A"
            }

            for rec in expected_records:
                target_name = rec["name"].lower()
                existing = existing_records.get(target_name)

                if existing:
                    # Update if IP or proxied state differs
                    rec_id = existing["id"]
                    if existing.get("content") != rec["content"] or existing.get("proxied") != rec["proxied"]:
                        up_resp = await client.put(
                            f"{CF_API_BASE}/zones/{zone_id}/dns_records/{rec_id}",
                            headers=headers,
                            json=rec,
                        )
                        results.append({
                            "name": rec["name"],
                            "action": "updated",
                            "status": "success" if up_resp.status_code == 200 else "failed",
                        })
                    else:
                        results.append({"name": rec["name"], "action": "already_exists", "status": "success"})
                else:
                    # Create new record
                    create_resp = await client.post(
                        f"{CF_API_BASE}/zones/{zone_id}/dns_records",
                        headers=headers,
                        json=rec,
                    )
                    results.append({
                        "name": rec["name"],
                        "action": "created",
                        "status": "success" if create_resp.status_code in (200, 201) else "failed",
                    })

        return {
            "synced": True,
            "configured": True,
            "results": results,
            "records": expected_records,
            "message": "Cloudflare DNS records synchronized successfully.",
        }

    except Exception as e:
        logger.error("Error communicating with Cloudflare API: %s", e)
        return {
            "synced": False,
            "configured": True,
            "error": str(e),
            "records": expected_records,
        }

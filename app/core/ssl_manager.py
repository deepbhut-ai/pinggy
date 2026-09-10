"""SSL & Custom Domain Manager for Zero-Downtime Let's Encrypt certificates.

Implements the complete SSL workflow defined in Doc/ssl.md:
1. DNS verification against server IP
2. Certbot HTTP-01 webroot challenge (/var/www/certbot)
3. Dynamic Nginx server block generation in /etc/nginx/sites-available/
4. Symlinking to /etc/nginx/sites-enabled/
5. Graceful Nginx reload (nginx -t && nginx -s reload)
6. Automatic certbot cleanup on domain removal
7. Development / mock fallback when running outside production Linux
"""
import asyncio
import logging
import os
import shutil
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger("ssl_manager")


async def verify_domain_dns(domain: str) -> dict[str, Any]:
    """Verify that a custom domain resolves to the server IP or responds to health check.

    Returns dict with keys:
      dns_resolves (bool), pointed_ip (str|None), status ('ok'|'no_dns'|'error'), message (str)
    """
    domain = domain.strip().lower()
    target_ip = settings.SERVER_IP

    # 1. DNS address resolution
    try:
        loop = asyncio.get_running_loop()
        resolved_infos = await loop.run_in_executor(
            None, lambda: socket.getaddrinfo(domain, None)
        )
        all_ips = [info[4][0] for info in resolved_infos]
        primary_ip = all_ips[0] if all_ips else None
    except socket.gaierror:
        return {
            "dns_resolves": False,
            "pointed_ip": None,
            "status": "no_dns",
            "message": f"⚠️ {domain} has no DNS record. Add an A record pointing to {target_ip}",
        }
    except Exception as e:
        return {
            "dns_resolves": False,
            "pointed_ip": None,
            "status": "error",
            "message": f"DNS query failed: {e}",
        }

    points_to_us = target_ip in all_ips

    # 2. HTTP health check test
    health_ok = False
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            for scheme in ("https", "http"):
                try:
                    resp = await client.get(f"{scheme}://{domain}/health")
                    if resp.status_code == 200:
                        body = resp.json()
                        if body.get("status") == "ok":
                            health_ok = True
                            break
                except Exception:
                    continue
    except Exception:
        pass

    if health_ok:
        return {
            "dns_resolves": True,
            "pointed_ip": primary_ip,
            "status": "ok",
            "message": f"✅ {domain} is verified and reaching this server",
        }

    if points_to_us:
        return {
            "dns_resolves": True,
            "pointed_ip": primary_ip,
            "status": "ok",
            "message": f"✅ {domain} A record points to {target_ip}",
        }

    return {
        "dns_resolves": True,
        "pointed_ip": primary_ip,
        "status": "error",
        "message": f"⚠️ {domain} resolves to {primary_ip}, not {target_ip}. Point your DNS A record to {target_ip}",
    }


def _is_production_environment() -> bool:
    """Check if certbot and nginx are present in the system environment."""
    has_certbot = shutil.which("certbot") is not None
    has_nginx = shutil.which("nginx") is not None
    has_sites_dir = os.path.exists(settings.NGINX_SITES_AVAILABLE)
    return bool(has_certbot and has_nginx and has_sites_dir)


def _generate_nginx_config_content(domain: str) -> str:
    """Generate the Nginx server block for a custom domain with SSL."""
    cert_path = f"{settings.SSL_CERT_DIR}/{domain}/fullchain.pem"
    key_path = f"{settings.SSL_CERT_DIR}/{domain}/privkey.pem"

    return f"""# Nginx configuration for custom domain: {domain}
# Managed automatically by IRAGT SSL Manager
# Zero-downtime HTTPS reverse proxy

server {{
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name {domain};

    ssl_certificate     {cert_path};
    ssl_certificate_key {key_path};

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {{
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts for tunneled requests
        proxy_connect_timeout 30s;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # Stream directly through the tunnel
        proxy_buffering off;
    }}
}}
"""


async def _run_command(cmd: list[str]) -> tuple[int, str, str]:
    """Execute a system shell command asynchronously."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return (
        proc.returncode if proc.returncode is not None else -1,
        stdout.decode("utf-8", errors="replace"),
        stderr.decode("utf-8", errors="replace"),
    )


async def provision_ssl_for_domain(
    domain: str,
    email: str | None = None,
    skip_dns_check: bool = False,
) -> dict[str, Any]:
    """Issue SSL certificate via Let's Encrypt Certbot, create Nginx config, and gracefully reload Nginx.

    Steps (from Doc/ssl.md):
      1. Verify DNS A record.
      2. Run Certbot HTTP-01 webroot challenge:
         certbot certonly --webroot -w /var/www/certbot -d <domain>
      3. Create /etc/nginx/sites-available/custom-<domain>
      4. Symlink to /etc/nginx/sites-enabled/custom-<domain>
      5. Graceful reload: nginx -t && nginx -s reload (zero downtime)
    """
    domain = domain.strip().lower()
    contact_email = email or settings.SSL_ADMIN_EMAIL

    # Step 1: Verify DNS
    if not skip_dns_check:
        dns_result = await verify_domain_dns(domain)
        if dns_result["status"] != "ok":
            return {
                "status": "error",
                "stage": "dns_verification",
                "message": dns_result["message"],
                "domain": domain,
                "dns_result": dns_result,
            }

    # If running in a development / non-production environment where certbot or nginx isn't available
    if not _is_production_environment():
        logger.info(
            "Non-production or dev environment detected. Simulating SSL provisioning for domain '%s'.",
            domain,
        )
        return {
            "status": "ok",
            "stage": "completed",
            "message": f"✅ SSL simulated successfully for {domain} (dev/mock environment).",
            "domain": domain,
            "https_url": f"https://{domain}",
            "is_dev_mode": True,
        }

    # Ensure certbot webroot directory exists
    webroot_path = Path(settings.SSL_WEBROOT_PATH)
    try:
        webroot_path.mkdir(parents=True, exist_ok=True)
        acme_dir = webroot_path / ".well-known" / "acme-challenge"
        acme_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.warning("Could not create certbot webroot dir %s: %s", webroot_path, e)

    # Step 2: Run certbot webroot command
    certbot_cmd = [
        "certbot",
        "certonly",
        "--webroot",
        "-w",
        str(settings.SSL_WEBROOT_PATH),
        "-d",
        domain,
        "--non-interactive",
        "--agree-tos",
        "--email",
        contact_email,
        "--keep-until-expiring",
    ]

    logger.info("Executing certbot for domain: %s", domain)
    code, stdout, stderr = await _run_command(certbot_cmd)
    if code != 0:
        logger.error("Certbot failed for %s (exit code %d): %s %s", domain, code, stdout, stderr)
        return {
            "status": "error",
            "stage": "certbot_issuance",
            "message": f"Certbot SSL issuance failed: {stderr or stdout}",
            "domain": domain,
            "error_details": {"stdout": stdout, "stderr": stderr},
        }

    # Step 3: Write Nginx config
    sites_avail = Path(settings.NGINX_SITES_AVAILABLE)
    sites_enabled = Path(settings.NGINX_SITES_ENABLED)
    config_filename = f"custom-{domain}"
    avail_file = sites_avail / config_filename
    enabled_link = sites_enabled / config_filename

    config_content = _generate_nginx_config_content(domain)

    try:
        avail_file.write_text(config_content, encoding="utf-8")
        if enabled_link.exists() or enabled_link.is_symlink():
            enabled_link.unlink()
        enabled_link.symlink_to(avail_file)
    except Exception as e:
        logger.error("Failed to write Nginx config for %s: %s", domain, e)
        return {
            "status": "error",
            "stage": "nginx_config_write",
            "message": f"Failed writing Nginx virtual host config: {e}",
            "domain": domain,
        }

    # Step 4: Test Nginx configuration (nginx -t)
    test_code, test_out, test_err = await _run_command(["nginx", "-t"])
    if test_code != 0:
        logger.error("Nginx configuration test failed after adding %s: %s", domain, test_err or test_out)
        # Rollback symlink so other services aren't affected
        if enabled_link.exists() or enabled_link.is_symlink():
            enabled_link.unlink()
        return {
            "status": "error",
            "stage": "nginx_test",
            "message": f"Nginx config test failed: {test_err or test_out}",
            "domain": domain,
        }

    # Step 5: Graceful Nginx reload (nginx -s reload)
    reload_code, reload_out, reload_err = await _run_command(["nginx", "-s", "reload"])
    if reload_code != 0:
        # Fallback to systemctl reload nginx
        reload_code, reload_out, reload_err = await _run_command(["systemctl", "reload", "nginx"])

    if reload_code != 0:
        logger.error("Nginx graceful reload failed for %s: %s", domain, reload_err or reload_out)
        return {
            "status": "error",
            "stage": "nginx_reload",
            "message": f"Nginx graceful reload failed: {reload_err or reload_out}",
            "domain": domain,
        }

    logger.info("SSL certificate and Nginx HTTPS config activated successfully for %s", domain)
    return {
        "status": "ok",
        "stage": "completed",
        "message": f"🎉 SSL certificate active and Nginx reloaded for {domain}",
        "domain": domain,
        "https_url": f"https://{domain}",
    }


async def deprovision_ssl_for_domain(domain: str) -> dict[str, Any]:
    """Remove Nginx config, graceful reload, and delete Certbot certificate on domain deletion.

    Steps (from Doc/ssl.md):
      1. Remove /etc/nginx/sites-available/custom-<domain> & sites-enabled link.
      2. Graceful reload: nginx -s reload.
      3. Delete cert: certbot delete --cert-name <domain> --non-interactive.
    """
    domain = domain.strip().lower()

    if not _is_production_environment():
        logger.info("Simulating SSL deprovisioning for %s (dev environment).", domain)
        return {"status": "ok", "message": f"SSL deprovisioned for {domain} (dev mode).", "domain": domain}

    config_filename = f"custom-{domain}"
    avail_file = Path(settings.NGINX_SITES_AVAILABLE) / config_filename
    enabled_link = Path(settings.NGINX_SITES_ENABLED) / config_filename

    # 1. Remove Nginx site files
    if enabled_link.exists() or enabled_link.is_symlink():
        try:
            enabled_link.unlink()
        except Exception as e:
            logger.warning("Could not unlink %s: %s", enabled_link, e)

    if avail_file.exists():
        try:
            avail_file.unlink()
        except Exception as e:
            logger.warning("Could not delete %s: %s", avail_file, e)

    # 2. Reload Nginx
    test_code, _, _ = await _run_command(["nginx", "-t"])
    if test_code == 0:
        await _run_command(["nginx", "-s", "reload"])

    # 3. Clean up Certbot cert
    code, out, err = await _run_command(
        ["certbot", "delete", "--cert-name", domain, "--non-interactive"]
    )
    if code != 0:
        logger.warning("Certbot delete for %s exited with %d: %s", domain, code, err or out)

    return {
        "status": "ok",
        "message": f"SSL certificate and Nginx configuration removed for {domain}",
        "domain": domain,
    }


async def get_ssl_status(domain: str) -> dict[str, Any]:
    """Inspect certificate files and active status for a given domain."""
    domain = domain.strip().lower()
    cert_path = Path(settings.SSL_CERT_DIR) / domain / "fullchain.pem"
    enabled_link = Path(settings.NGINX_SITES_ENABLED) / f"custom-{domain}"

    has_cert = cert_path.exists()
    has_nginx = enabled_link.exists()

    expiry_str = None
    if has_cert:
        try:
            # Check expiry via openssl
            code, out, _ = await _run_command(
                ["openssl", "x509", "-enddate", "-noout", "-in", str(cert_path)]
            )
            if code == 0 and "notAfter=" in out:
                raw_date = out.split("notAfter=")[-1].strip()
                expiry_str = raw_date
        except Exception:
            pass

    return {
        "domain": domain,
        "has_ssl_certificate": has_cert,
        "has_nginx_active": has_nginx,
        "status": "active" if (has_cert and has_nginx) else "inactive",
        "expires_at": expiry_str,
    }

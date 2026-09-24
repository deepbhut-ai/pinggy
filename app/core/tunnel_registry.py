"""In-memory tunnel registry — maps subdomains to SSH tunnel sessions.

This is the core state that connects the SSH server (which receives reverse
port forwards) with the HTTP proxy (which routes subdomain requests to those
ports). All state is kept in memory for speed; the DB is used for persistence
and the admin panel.
"""
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

logger = logging.getLogger("tunnel_registry")


@dataclass
class TunnelSession:
    """Represents one active SSH tunnel."""
    tunnel_id: str
    subdomain: str
    remote_port: int          # port on the server that SSH forwards to
    local_port: int           # port on the user's machine (from -R0:localhost:PORT)
    protocol: str             # "http" or "tcp"
    user_email: str           # SSH username used to connect
    ssh_peer: str             # remote address of SSH client
    custom_domain: str = ""  # primary custom domain (if token has one)
    custom_domains: list = field(default_factory=list)  # extra domains (v1.4.0)
    endpoints: dict = field(default_factory=dict)   # v1.9.0 multi-port: address -> remote_port
    local_ports: dict = field(default_factory=dict)  # v1.9.0 multi-port: address -> client local port (display)
    paused_endpoints: set = field(default_factory=set)  # runtime paused domains (v3.0.0)
    token: str = ""           # authenticating tunnel token (security lookups, v0.8.0)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    request_count: int = 0
    bytes_transferred: int = 0
    bytes_sent: int = 0      # responses out of the local service (v1.2.0)
    bytes_received: int = 0  # requests into the local service (v1.2.0)
    # Reference to the asyncssh SSHServerConnection for cleanup
    ssh_conn: Any = None
    # Callback to send log lines to the user's SSH terminal (live request log)
    log_callback: Callable[[str], None] | None = None

    @property
    def url(self) -> str:
        scheme = "https" if _proxy_port == 80 else "http"
        return f"{scheme}://{self.subdomain}.{_domain}"

    @property
    def custom_url(self) -> str:
        """Custom domain URL (if set), otherwise empty string."""
        if self.custom_domain:
            scheme = "https" if _proxy_port == 80 else "http"
            return f"{scheme}://{self.custom_domain}"
        return ""

    @property
    def is_alive(self) -> bool:
        return self.ssh_conn is not None

    def is_endpoint_paused(self, address: str) -> bool:
        """Check if an endpoint address is paused at runtime."""
        if not address:
            return False
        norm = address.replace("https://", "").replace("http://", "").strip().lower().split("/")[0].split(":")[0]
        if norm in self.paused_endpoints:
            return True
        if norm == self.subdomain and f"{self.subdomain}.{_domain}" in self.paused_endpoints:
            return True
        if norm == f"{self.subdomain}.{_domain}" and self.subdomain in self.paused_endpoints:
            return True
        return False

    def endpoint_port(self, address: str) -> int:
        """v1.9.0: remote port serving this address (falls back to the default)."""
        try:
            return self.endpoints.get(address.strip().lower().split(":")[0], self.remote_port)
        except Exception:
            return self.remote_port

    def all_addresses(self) -> list[str]:
        """Canonical order: subdomain host, primary domain, extras."""
        out = [self.subdomain]
        if self.custom_domain:
            out.append(self.custom_domain)
        out.extend(d for d in (self.custom_domains or []))
        return out


_domain: str = "localhost"
_proxy_port: int = 8080

# subdomain → TunnelSession
_tunnels: dict[str, TunnelSession] = {}
# remote_port → subdomain (for quick lookup during proxy)
_port_to_subdomain: dict[int, str] = {}
_lock = asyncio.Lock()


def init_registry(domain: str, proxy_port: int) -> None:
    global _domain, _proxy_port
    _domain = domain
    _proxy_port = proxy_port


async def register_tunnel(tunnel: TunnelSession) -> None:
    async with _lock:
        _tunnels[tunnel.subdomain] = tunnel
        _port_to_subdomain[tunnel.remote_port] = tunnel.subdomain


async def remove_tunnel(subdomain: str) -> TunnelSession | None:
    async with _lock:
        tunnel = _tunnels.pop(subdomain, None)
        if tunnel:
            _port_to_subdomain.pop(tunnel.remote_port, None)
        return tunnel


async def get_tunnel(subdomain: str) -> TunnelSession | None:
    return _tunnels.get(subdomain)


async def get_tunnel_by_custom_domain(custom_domain: str) -> TunnelSession | None:
    """Find the active tunnel assigned to a custom domain."""
    normalized_domain = custom_domain.strip().lower().split(":")[0]  # strip :port
    for tunnel in _tunnels.values():
        if tunnel.custom_domain.strip().lower().split(":")[0] == normalized_domain:
            return tunnel
        # v1.4.0: match extra domains attached to the token
        for d in getattr(tunnel, "custom_domains", []) or []:
            if str(d).strip().lower() == normalized_domain:
                return tunnel
    # Fallback dynamic match: check if this domain belongs to an active user/token in DB
    try:
        from app.core.db import get_conn
        async with get_conn() as db:
            cur = await db.execute(
                "SELECT token, user_email FROM tokens WHERE custom_domain = %s "
                "UNION "
                "SELECT t.token, t.user_email FROM token_domains td JOIN tokens t ON t.id = td.token_id WHERE td.domain = %s",
                (normalized_domain, normalized_domain),
            )
            row = await cur.fetchone()
            await cur.close()
            if row:
                tok, email = row[0], row[1]
                # Find active live tunnel session matching token or user email
                for tunnel in _tunnels.values():
                    if (tunnel.token and tunnel.token == tok) or (tunnel.user_email and email and tunnel.user_email.lower() == email.lower()):
                        if normalized_domain not in tunnel.custom_domains:
                            tunnel.custom_domains.append(normalized_domain)
                        if normalized_domain not in tunnel.endpoints:
                            tunnel.endpoints[normalized_domain] = tunnel.remote_port
                        return tunnel
    except Exception:
        pass

    return None


async def get_tunnel_by_port(port: int) -> TunnelSession | None:
    sub = _port_to_subdomain.get(port)
    if sub:
        return _tunnels.get(sub)
    return None


async def list_tunnels() -> list[TunnelSession]:
    return list(_tunnels.values())


async def reconcile_tunnels_with_db() -> dict[str, int]:
    """On startup, mark any DB rows still 'active' as disconnected.

    The in-memory registry is authoritative for live SSH sessions. After a
    process restart all SSH connections are gone, so any rows left as 'active'
    in the DB are stale and must be cleaned up before new tunnels connect.
    Returns counts of rows updated and rows currently in memory.
    """
    updated = 0
    try:
        from app.core.db import get_conn
        async with get_conn() as db:
            # v2.10.0: mark ALL 'active' rows as disconnected (not just ones
            # where closed_at IS NULL). Previous versions skipped rows that
            # already had closed_at set, leaving stale 'active' rows behind
            # after a restart — these caused duplicate tunnel entries and
            # confused the proxy which tried to route to dead ports.
            cur = await db.execute(
                "UPDATE tunnels SET status = 'disconnected', closed_at = COALESCE(closed_at, now()) "
                "WHERE status = 'active'"
            )
            updated = cur.rowcount
            await cur.close()
    except Exception as e:
        logger = getattr(asyncio.get_event_loop(), '__logger', None)
        if logger:
            logger.warning("Failed to reconcile stale tunnel rows: %s", e)
    return {"stale_rows_marked_disconnected": updated, "in_memory_tunnels": len(_tunnels)}


async def periodic_reconcile_stale_tunnels() -> None:
    """Background task (v2.10.0): every 5 minutes, mark DB tunnel rows as
    'disconnected' if they have no matching in-memory session.

    The in-memory _tunnels dict is authoritative for live SSH sessions.
    After a race-condition failure or an unclean disconnect, stale 'active'
    rows accumulate in the DB. This task cleans them up so the proxy,
    dashboard, and API all see accurate tunnel counts."""
    import asyncio
    from app.core.db import get_conn
    while True:
        await asyncio.sleep(300)  # 5 minutes
        try:
            live_subdomains = set(_tunnels.keys())
            async with get_conn() as db:
                if live_subdomains:
                    # Mark all 'active' rows whose subdomain is NOT in memory
                    cur = await db.execute(
                        "UPDATE tunnels SET status = 'disconnected', closed_at = COALESCE(closed_at, now()) "
                        "WHERE status = 'active' AND subdomain != ALL(%s)",
                        (list(live_subdomains),),
                    )
                else:
                    # No live tunnels — mark everything as disconnected
                    cur = await db.execute(
                        "UPDATE tunnels SET status = 'disconnected', closed_at = COALESCE(closed_at, now()) "
                        "WHERE status = 'active'"
                    )
                updated = cur.rowcount
                await cur.close()
            if updated:
                logger.warning("Periodic reconcile: marked %d stale tunnel rows as disconnected", updated)
        except Exception as e:
            logger.warning("Periodic reconcile failed: %s", e)


async def increment_request_count(subdomain: str, bytes_count: int = 0, sent: int = 0, received: int = 0) -> None:
    """Increment traffic counters for a tunnel.

    sent     = response bytes leaving the local service (↑)
    received = request bytes arriving at the local service (↓)
    bytes_count = total for this request (sent + received) — keeps
    bytes_transferred as the combined total.

    Updates the in-memory session AND writes through to the tunnels table so
    per-token traffic and analytics see real numbers. DB failure must never
    break the proxied request — swallowed.
    """
    tunnel = _tunnels.get(subdomain)
    if tunnel:
        tunnel.request_count += 1
        tunnel.bytes_transferred += bytes_count
        tunnel.bytes_sent += sent
        tunnel.bytes_received += received
        try:
            from app.core.db import get_conn
            async with get_conn() as db:
                cur = await db.execute(
                    "UPDATE tunnels SET request_count = %s, bytes_transferred = %s, "
                    "bytes_sent = %s, bytes_received = %s "
                    "WHERE subdomain = %s AND status = 'active'",
                    (tunnel.request_count, tunnel.bytes_transferred,
                     tunnel.bytes_sent, tunnel.bytes_received, subdomain),
                )
                await cur.close()
        except Exception:
            pass  # stats write-through is best-effort


def log_to_tunnel(subdomain: str, message: str) -> None:
    """Send a log line to the tunnel's SSH terminal (if connected)."""
    tunnel = _tunnels.get(subdomain)
    if tunnel and tunnel.log_callback:
        try:
            tunnel.log_callback(message)
        except Exception:
            pass  # Don't let logging break the request


def is_subdomain_taken(subdomain: str) -> bool:
    return subdomain in _tunnels


async def sync_tunnel_multiport_config(user_email: str, token: str, ports_map: dict) -> None:
    """Synchronize multiport enable/pause states and bind new endpoints dynamically for all matching active tunnel sessions."""
    async with _lock:
        for tunnel in _tunnels.values():
            match = False
            if tunnel.token and token and tunnel.token == token:
                match = True
            elif tunnel.user_email and user_email and tunnel.user_email.lower() == user_email.lower():
                match = True
            if match:
                # Determine active local ports forwarded by this specific tunnel session
                active_tunnel_ports = set()
                if tunnel.local_port:
                    active_tunnel_ports.add(tunnel.local_port)
                for lp in tunnel.local_ports.values():
                    if lp:
                        try:
                            active_tunnel_ports.add(int(lp))
                        except (ValueError, TypeError):
                            pass

                for addr, info in (ports_map or {}).items():
                    norm = addr.replace("https://", "").replace("http://", "").strip().lower().split("/")[0].split(":")[0]
                    if not norm:
                        continue

                    target_port = None
                    if isinstance(info, dict) and "port" in info:
                        try:
                            target_port = int(str(info["port"]).strip())
                        except (ValueError, TypeError):
                            pass

                    # Check if this domain belongs to this specific tunnel session
                    belongs_to_tunnel = False
                    if norm == tunnel.subdomain.lower() or norm == f"{tunnel.subdomain.lower()}.{_domain.lower()}":
                        belongs_to_tunnel = True
                    elif tunnel.custom_domain and norm == tunnel.custom_domain.strip().lower():
                        belongs_to_tunnel = True
                    elif norm in [d.strip().lower() for d in (tunnel.custom_domains or [])]:
                        belongs_to_tunnel = True
                    elif norm in tunnel.endpoints:
                        belongs_to_tunnel = True
                    elif target_port is not None and active_tunnel_ports and target_port in active_tunnel_ports:
                        belongs_to_tunnel = True
                    elif not active_tunnel_ports and not tunnel.local_ports:
                        # Fallback for generic untracked sessions
                        belongs_to_tunnel = True

                    # If this domain does not belong to this tunnel session, do not alter endpoints or send messages
                    if not belongs_to_tunnel:
                        continue

                    # Dynamically bind new domain to active live tunnel session in memory
                    if norm not in tunnel.custom_domains and norm != tunnel.subdomain and norm != f"{tunnel.subdomain}.{_domain}":
                        tunnel.custom_domains.append(norm)
                    if norm not in tunnel.endpoints:
                        tunnel.endpoints[norm] = tunnel.remote_port
                    if target_port is not None:
                        tunnel.local_ports[norm] = target_port

                    # State update & live SSH console notification (only log when state actually changes)
                    if isinstance(info, dict) and info.get("enabled") is False:
                        if norm not in tunnel.paused_endpoints:
                            tunnel.paused_endpoints.add(norm)
                            if tunnel.log_callback:
                                try:
                                    tunnel.log_callback(f"  [dashboard] ⏸️  Paused endpoint: https://{norm}")
                                except Exception:
                                    pass
                    else:
                        if norm in tunnel.paused_endpoints:
                            tunnel.paused_endpoints.discard(norm)
                            if tunnel.log_callback:
                                try:
                                    tunnel.log_callback(f"  [dashboard] ▶️  Resumed endpoint: https://{norm}")
                                except Exception:
                                    pass
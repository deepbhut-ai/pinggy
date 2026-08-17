"""In-memory tunnel registry — maps subdomains to SSH tunnel sessions.

This is the core state that connects the SSH server (which receives reverse
port forwards) with the HTTP proxy (which routes subdomain requests to those
ports). All state is kept in memory for speed; the DB is used for persistence
and the admin panel.
"""
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


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
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    request_count: int = 0
    bytes_transferred: int = 0
    # Reference to the asyncssh SSHServerConnection for cleanup
    ssh_conn: Any = None

    @property
    def url(self) -> str:
        return f"http://{self.subdomain}.{_domain}:{_proxy_port}"

    @property
    def is_alive(self) -> bool:
        return self.ssh_conn is not None


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


async def get_tunnel_by_port(port: int) -> TunnelSession | None:
    sub = _port_to_subdomain.get(port)
    if sub:
        return _tunnels.get(sub)
    return None


async def list_tunnels() -> list[TunnelSession]:
    return list(_tunnels.values())


async def increment_request_count(subdomain: str, bytes_count: int = 0) -> None:
    tunnel = _tunnels.get(subdomain)
    if tunnel:
        tunnel.request_count += 1
        tunnel.bytes_transferred += bytes_count


def is_subdomain_taken(subdomain: str) -> bool:
    return subdomain in _tunnels
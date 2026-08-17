"""SSH server for tunnel service.

Accepts SSH connections with reverse port forwarding (-R0:localhost:PORT).
On connect, allocates a random subdomain and prints the public URL.
The HTTP proxy then routes requests for that subdomain through the SSH
reverse tunnel.

Usage (user side):
    ssh -p 2222 -R0:localhost:8080 localhost
"""
import asyncio
import logging
import os
import random
import string

import asyncssh

from app.core.config import settings
from app.core.tunnel_registry import (
    TunnelSession,
    is_subdomain_taken,
    register_tunnel,
    remove_tunnel,
)

logger = logging.getLogger("ssh_server")


def _generate_subdomain(length: int = 7) -> str:
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choices(chars, k=length))


def _generate_tunnel_id() -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=12))


class MySSHServer(asyncssh.SSHServer):
    """SSH server that accepts reverse port forwards and creates tunnels."""

    def __init__(self):
        self._conn: asyncssh.SSHServerConnection | None = None
        self._username = "anonymous"
        self._peer = "unknown"
        self._tunnel: TunnelSession | None = None

    def connection_made(self, conn: asyncssh.SSHServerConnection) -> None:
        self._conn = conn
        peer = conn.get_extra_info("peername")
        if peer:
            self._peer = f"{peer[0]}:{peer[1]}"
        logger.info("SSH connection from %s", self._peer)

    def connection_lost(self, exc: Exception | None) -> None:
        logger.info("SSH connection lost from %s", self._peer)
        if self._tunnel:
            asyncio.create_task(self._cleanup_tunnel())

    async def _cleanup_tunnel(self) -> None:
        if self._tunnel:
            await remove_tunnel(self._tunnel.subdomain)
            try:
                from app.core.db import get_conn
                async with get_conn() as db:
                    cur = await db.execute(
                        "UPDATE tunnels SET status = 'disconnected', closed_at = now() "
                        "WHERE tunnel_id = %s",
                        (self._tunnel.tunnel_id,),
                    )
                    await cur.close()
            except Exception as e:
                logger.warning("Failed to update tunnel status in DB: %s", e)
            logger.info("Tunnel %s (%s) removed", self._tunnel.tunnel_id, self._tunnel.subdomain)
            self._tunnel = None

    def begin_auth(self, username: str) -> bool:
        """Token-based auth: the SSH username must be a valid tunnel_token from the DB.
        We verify the token synchronously here and return False (no further auth needed)
        if valid, or True (require password, which will fail) if invalid."""
        token = username or ""
        if not token:
            logger.warning("SSH connection rejected: no token provided from %s", self._peer)
            return True  # Require password → will fail → connection rejected

        # Synchronous DB check — no password needed if token is valid
        if self._verify_tunnel_token_sync(token):
            logger.info("SSH auth OK: token verified for user %s from %s", self._username, self._peer)
            return False  # No further auth needed — token is valid
        else:
            logger.warning("SSH auth rejected: invalid token '%s...' from %s", token[:8], self._peer)
            return True  # Require password → will fail → connection rejected

    def password_auth_supported(self) -> bool:
        return True

    def validate_password(self, username: str, password: str) -> bool:
        """If we get here, the token was invalid. Reject everything."""
        return False

    def _verify_tunnel_token_sync(self, token: str) -> bool:
        """Synchronous DB check — used from begin_auth which is a sync callback."""
        import psycopg
        from app.core.config import settings
        try:
            # Use a one-off sync connection (not from the async pool)
            conn = psycopg.connect(settings.async_dsn, autocommit=True)
            cur = conn.execute(
                "SELECT email FROM users WHERE tunnel_token = %s",
                (token,),
            )
            row = cur.fetchone()
            cur.close()
            conn.close()
            if row:
                self._username = row[0]  # Store the real email as username
                return True
            return False
        except Exception as e:
            logger.error("DB error verifying tunnel token: %s", e)
            return False

    def server_requested(self, listen_host: str, listen_port: int) -> bool:
        """Called when client requests TCP port forwarding (ssh -R).

        Return True to let asyncssh handle the forwarding automatically.
        After the listener is created, we scan _local_listeners to find
        the allocated port and set up the tunnel registry.
        """
        logger.info("Port forward requested: %s:%d from %s", listen_host, listen_port, self._peer)
        # Schedule tunnel setup after asyncssh creates the listener
        asyncio.create_task(self._detect_port_and_setup())
        return True

    async def _detect_port_and_setup(self) -> None:
        """Wait for asyncssh to create the listener, then find the port
        in _local_listeners and set up the tunnel."""
        # Give asyncssh time to create the listener
        await asyncio.sleep(0.5)

        if not self._conn or self._tunnel:
            return

        # Scan _local_listeners for the allocated port
        local_listeners = getattr(self._conn, "_local_listeners", {})
        for (host, port), listener in local_listeners.items():
            if listener and not self._tunnel:
                # Found the forwarded port
                await self._setup_tunnel(port)
                return

        # If not found, retry once more
        await asyncio.sleep(1.0)
        local_listeners = getattr(self._conn, "_local_listeners", {})
        for (host, port), listener in local_listeners.items():
            if listener and not self._tunnel:
                await self._setup_tunnel(port)
                return

        logger.warning("Could not detect forwarded port for %s", self._peer)

    async def _setup_tunnel(self, remote_port: int) -> None:
        """Create the tunnel: allocate subdomain, register in memory + DB."""
        if self._tunnel:
            return
        try:
            subdomain = _generate_subdomain(settings.SUBDOMAIN_LENGTH)
            while is_subdomain_taken(subdomain):
                subdomain = _generate_subdomain(settings.SUBDOMAIN_LENGTH)

            tunnel_id = _generate_tunnel_id()

            self._tunnel = TunnelSession(
                tunnel_id=tunnel_id,
                subdomain=subdomain,
                remote_port=remote_port,
                local_port=0,
                protocol="http",
                user_email=self._username,
                ssh_peer=self._peer,
                ssh_conn=self._conn,
            )

            from app.core.db import get_conn
            async with get_conn() as db:
                cur = await db.execute(
                    """
                    INSERT INTO tunnels (tunnel_id, subdomain, remote_port, local_port,
                                         protocol, user_email, ssh_peer, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'active')
                    """,
                    (tunnel_id, subdomain, remote_port, 0, "http", self._username, self._peer),
                )
                await cur.close()

            await register_tunnel(self._tunnel)

            url = f"http://{subdomain}.{settings.TUNNEL_DOMAIN}:{settings.PROXY_PORT}"
            logger.info("Tunnel created: %s → remote port %d (from %s)",
                        url, remote_port, self._peer)
            print(f"\n  ╔══════════════════════════════════════════════════════╗")
            print(f"  ║  pinggy tunnel — ACTIVE                               ║")
            print(f"  ║  URL:  {url:<46s}║")
            print(f"  ║  Remote port: {remote_port:<37d}║")
            print(f"  ║  User: {self._username:<44s}║")
            print(f"  ╚══════════════════════════════════════════════════════╝\n")

        except Exception as e:
            logger.error("Failed to setup tunnel: %s", e)


async def start_ssh_server() -> asyncio.AbstractServer:
    """Start the SSH server. Must be called within the async event loop."""
    host_key_path = "ssh_host_key"
    if not os.path.exists(host_key_path):
        logger.info("Generating SSH host key...")
        key = asyncssh.generate_private_key("ssh-ed25519")
        key.write_private_key(host_key_path)
        key.write_public_key(host_key_path + ".pub")
        logger.info("SSH host key saved to %s", host_key_path)

    server = await asyncssh.create_server(
        lambda: MySSHServer(),
        settings.SSH_HOST,
        settings.SSH_PORT,
        server_host_keys=[host_key_path],
        allow_pty=True,
        keepalive_interval=30,
        login_timeout=300,
    )

    print(f"[ssh] Server listening on {settings.SSH_HOST}:{settings.SSH_PORT}")
    print(f"[ssh] Connect with: ssh -p {settings.SSH_PORT} -R0:localhost:PORT {settings.TUNNEL_DOMAIN}")
    return server
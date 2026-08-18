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


class TunnelInfoSession(asyncssh.SSHServerSession):
    """SSH session that sends tunnel info to the user's terminal."""

    def __init__(self, server: "MySSHServer"):
        self._server = server
        self._chan: asyncssh.SSHServerChannel | None = None
        self._info_sent = False

    def connection_made(self, chan: asyncssh.SSHServerChannel) -> None:
        self._chan = chan

    def shell_requested(self) -> bool:
        return True

    def exec_requested(self, command: str) -> bool:
        return False

    def session_started(self) -> None:
        """Called when the session starts — try to send tunnel info."""
        # Schedule sending tunnel info (tunnel may not be ready yet)
        asyncio.create_task(self._send_info_when_ready())

    async def _send_info_when_ready(self) -> None:
        """Wait for the tunnel to be set up, then send the info to the client."""
        # Wait for tunnel to be created (retry for up to 10 seconds)
        for _ in range(20):
            if self._server._tunnel and not self._info_sent:
                tunnel = self._server._tunnel
                # Use https:// when behind Cloudflare (port 80 = proxied by CF)
                scheme = "https" if settings.PROXY_PORT == 80 else "http"
                url = f"{scheme}://{tunnel.subdomain}.{settings.TUNNEL_DOMAIN}"
                lines = [
                    "",
                    "  ╔══════════════════════════════════════════════════════╗",
                    "  ║  pinggy tunnel — ACTIVE                               ║",
                    f"  ║  URL:  {url:<46s}║",
                    f"  ║  Remote port: {tunnel.remote_port:<37d}║",
                    f"  ║  User: {self._server._username:<44s}║",
                    "  ╚══════════════════════════════════════════════════════╝",
                    "",
                    "  Share this URL to access your local service.",
                    "  Press Ctrl+C to stop the tunnel.",
                    "",
                ]
                data = "\n".join(lines) + "\n"
                if self._chan:
                    self._chan.write(data)
                    # Don't call flush() — SSHServerChannel doesn't support it
                self._info_sent = True
                logger.info("Tunnel info sent to client terminal")
                return
            await asyncio.sleep(0.5)

    def data_received(self, data: str, datatype: int) -> None:
        """Handle data from client — close on Ctrl+C (0x03) or 'q'."""
        # Ctrl+C is 0x03 — check in both string and bytes form
        if '\x03' in data or b'\x03' in (data.encode() if isinstance(data, str) else data):
            # Ctrl+C received — close everything
            self._cleanup_and_close()
        elif data.strip().lower() == 'q':
            # 'q' to quit
            self._cleanup_and_close()

    def break_received(self, signal: str) -> bool:
        """Handle break signal (Ctrl+C in some terminals)."""
        self._cleanup_and_close()
        return True

    def _cleanup_and_close(self) -> None:
        """Close the channel and SSH connection, cleanup the tunnel."""
        if self._chan:
            try:
                self._chan.write("\n  Tunnel stopped.\n")
            except Exception:
                pass
            self._chan.close()
        if self._server._conn:
            self._server._conn.close()
        # Also cleanup the tunnel
        if self._server._tunnel:
            asyncio.create_task(self._server._cleanup_tunnel())

    def eof_received(self) -> bool:
        # Client closed their end — close the channel too
        if self._chan:
            self._chan.close()
        return True

    def close_received(self) -> None:
        if self._chan:
            self._chan.close()


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

    def session_requested(self) -> bool:
        """Allow the client to open a session so we can send the tunnel URL
        back to their terminal (like pinggy.io does)."""
        return TunnelInfoSession(self)

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
        """Create the tunnel: allocate subdomain, register in memory + DB.
        Each user gets a fixed subdomain derived from their token, so
        reconnecting with the same token gives the same URL."""
        if self._tunnel:
            return
        try:
            # Generate a deterministic subdomain from the user's token
            # so the same user always gets the same tunnel URL
            import hashlib
            token_hash = hashlib.md5(self._username.encode()).hexdigest()[:7]
            subdomain = token_hash

            # If this subdomain is already in use (user has an active tunnel),
            # remove the old one first
            if is_subdomain_taken(subdomain):
                from app.core.tunnel_registry import get_tunnel
                existing = await get_tunnel(subdomain)
                if existing and existing.user_email == self._username:
                    # Same user reconnecting — remove old tunnel
                    await remove_tunnel(subdomain)
                else:
                    # Different user has a hash collision — append a suffix
                    subdomain = f"{token_hash}1"

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

            scheme = "https" if settings.PROXY_PORT == 80 else "http"
            url = f"{scheme}://{subdomain}.{settings.TUNNEL_DOMAIN}"
            logger.info("Tunnel created: %s → remote port %d (from %s)",
                        url, remote_port, self._peer)

            # Print to server console
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
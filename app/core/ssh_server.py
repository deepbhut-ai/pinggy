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

    def write_log(self, message: str) -> None:
        """Write a log line to the user's terminal (called by the proxy)."""
        if not self._chan:
            return
        # asyncssh's SSHServerChannel doesn't have an `exit_status_sent`
        # attribute — using it raises AttributeError, which was silently
        # swallowed by log_to_tunnel's except, so NO log lines were ever
        # shown to the user.  Instead, just attempt the write and let the
        # try/except guard against a closed channel.
        try:
            self._chan.write(message + "\n")
        except Exception:
            pass

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
                custom_domain = self._server._custom_domain
                custom_url = f"{scheme}://{custom_domain}" if custom_domain else ""
                lines = [
                    "",
                    "  ╔══════════════════════════════════════════════════════╗",
                    "  ║  IRAGT tunnel — ACTIVE                                ║",
                    f"  ║  URL:  {url:<46s}║",
                ]
                if custom_url:
                    lines.append(f"  ║  Custom domain: {custom_url:<37s}║")
                lines += [
                    "  ╚══════════════════════════════════════════════════════╝",
                    "",
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
        self._token = ""
        self._plan = "free"
        self._seats = 1
        self._peer = "unknown"
        self._tunnel: TunnelSession | None = None
        self._timeout_task: asyncio.Task | None = None
        self._custom_domain: str = ""
        self._auth_failed: bool = False
        self._info_session: TunnelInfoSession | None = None
        self._setup_lock: asyncio.Lock = asyncio.Lock()  # v1.9.0: serialize multi-listener setup
        self._port_map = None

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
        if not self._tunnel:
            return
        if self._timeout_task:
            self._timeout_task.cancel()
            self._timeout_task = None
        tunnel = self._tunnel
        self._tunnel = None  # Set to None first to prevent double cleanup
        await remove_tunnel(tunnel.subdomain)
        try:
            from app.core.db import get_conn
            async with get_conn() as db:
                cur = await db.execute(
                    "UPDATE tunnels SET status = 'disconnected', closed_at = now() "
                    "WHERE tunnel_id = %s",
                    (tunnel.tunnel_id,),
                )
                await cur.close()
                # Tunnel-stopped notification email (Job 6) — best-effort
                try:
                    from app.core.email import send_template
                    await send_template(db, self._username, "tunnel_stopped", subdomain=tunnel.subdomain)
                except Exception:
                    pass
        except Exception as e:
            logger.warning("Failed to update tunnel status in DB: %s", e)
        # Close any TCP relay owned by this tunnel (v1.0.0)
        try:
            from app.core.tcp_relay import stop_relay_for_subdomain
            await stop_relay_for_subdomain(tunnel.subdomain)
        except Exception:
            pass
        logger.info("Tunnel %s (%s) removed", tunnel.tunnel_id, tunnel.subdomain)

    def begin_auth(self, username: str) -> bool:
        """Token-based auth: the SSH username must be a valid tunnel_token from the DB.
        Returns False (no further auth needed) if the token is valid.
        For invalid tokens, we also return False but mark the connection for
        immediate disconnect — this prevents SSH from prompting for a password."""
        token = username or ""
        if not token:
            logger.warning("SSH connection rejected: no token provided from %s", self._peer)
            self._auth_failed = True
            return False  # No password prompt — will be disconnected

        # Synchronous DB check — no password needed if token is valid
        if self._verify_tunnel_token_sync(token):
            logger.info("SSH auth OK: token verified for user %s from %s", self._username, self._peer)
            return False  # No further auth needed — token is valid
        else:
            logger.warning("SSH auth rejected: invalid token '%s...' from %s", token[:8], self._peer)
            self._auth_failed = True
            return False  # No password prompt — will be disconnected

    def password_auth_supported(self) -> bool:
        return False  # Never ask for a password

    def public_key_auth_supported(self) -> bool:
        return False  # No public key auth either

    def validate_password(self, username: str, password: str) -> bool:
        """Never called — password auth is not supported."""
        return False

    def session_requested(self) -> bool:
        """Allow the client to open a session so we can send the tunnel URL
        back to their terminal (like pinggy.io does)."""
        if self._auth_failed:
            return False  # Reject — invalid token
        self._info_session = TunnelInfoSession(self)
        return self._info_session

    def server_requested(self, listen_host: str, listen_port: int) -> bool:
        """Called when client requests TCP port forwarding (ssh -R).

        Return True to let asyncssh handle the forwarding automatically.
        After the listener is created, we scan _local_listeners to find
        the allocated port and set up the tunnel registry.
        v1.9.0: multiple listeners map to the token's addresses in order
        (subdomain → primary → extras) when the username carried --port list."""
        if self._auth_failed:
            return False  # Reject — invalid token
        logger.info("Port forward requested: %s:%d from %s", listen_host, listen_port, self._peer)
        # Schedule tunnel setup after asyncssh creates the listener
        asyncio.create_task(self._detect_port_and_setup())
        return True

    def _verify_tunnel_token_sync(self, token: str) -> bool:
        """Synchronous DB check — used from begin_auth which is a sync callback.
        Checks the tokens table first (multi-token system), then falls back
        to the users table (legacy single-token).
        v1.9.0: username may be TOKEN--3000,8000,5173 (multi-port: one listener
        per address, in order subdomain → primary → extras). Pro only."""
        import psycopg
        from app.core.config import settings
        self._port_map = None
        base_token = token
        if "--" in token:
            base_token, _, ports_s = token.partition("--")
            try:
                self._port_map = [int(p) for p in ports_s.split(",") if p.strip()]
                if not self._port_map:
                    self._port_map = None
            except ValueError:
                return False  # malformed suffix
        import psycopg
        from app.core.config import settings
        try:
            conn = psycopg.connect(settings.async_dsn, autocommit=True)

            # 1. Check tokens table (multi-token system — what the dashboard uses)
            try:
                cur = conn.execute(
                    "SELECT t.user_email, t.custom_domain, u.is_active, u.plan "
                    "FROM tokens t JOIN users u ON u.email = t.user_email "
                    "WHERE t.token = %s",
                    (base_token,),
                )
                row = cur.fetchone()
                cur.close()
                if row:
                    if not row[2]:
                        conn.close()
                        logger.warning("SSH auth rejected: account disabled (%s)", row[0])
                        return False
                    if self._port_map and (row[3] or "free") != "pro":
                        conn.close()
                        logger.warning("SSH multi-port rejected: %s not Pro", row[0])
                        return False
                    self._username = row[0]
                    self._custom_domain = row[1] or ""
                    self._token = base_token
                    # v1.4.0: load extra domains attached to this token
                    self._custom_domains = []
                    try:
                        cur = conn.execute(
                            "SELECT domain FROM token_domains WHERE token_id = "
                            "(SELECT id FROM tokens WHERE token = %s)",
                            (base_token,),
                        )
                        self._custom_domains = [r[0] for r in cur.fetchall()]
                        cur.close()
                    except Exception:
                        pass  # table missing pre-migration — fine
                    conn.close()
                    return True
            except psycopg.errors.UndefinedColumn:
                pass  # is_active column doesn't exist yet — fall through
            except psycopg.errors.UndefinedTable:
                pass  # tokens table doesn't exist — fall through

            # 2. Fallback: check users table (legacy single-token; no multi-port here)
            if self._port_map:
                conn.close()
                return False
            try:
                cur = conn.execute(
                    "SELECT email, custom_domain, is_active FROM users WHERE tunnel_token = %s",
                    (base_token,),
                )
            except psycopg.errors.UndefinedColumn:
                cur = conn.execute(
                    "SELECT email, custom_domain, TRUE FROM users WHERE tunnel_token = %s",
                    (base_token,),
                )
            row = cur.fetchone()
            cur.close()
            conn.close()
            if row:
                if not row[2]:
                    logger.warning("SSH auth rejected: account disabled (%s)", row[0])
                    return False
                self._username = row[0]
                self._custom_domain = row[1] or ""
                self._token = token
                return True
            return False
        except Exception as e:
            logger.error("DB error verifying tunnel token: %s", e)
            return False

    async def _detect_port_and_setup(self) -> None:
        """Wait for asyncssh to create the listener, then find the port
        in _local_listeners and set up the tunnel.
        v1.9.0: with a multi-port username (TOKEN--p1,p2,...), each listener
        binds to the next address (subdomain -> primary -> extras) on the SAME
        tunnel. A per-connection lock serializes concurrent listener setups."""
        await asyncio.sleep(0.5)

        if not self._conn:
            return

        multi = bool(getattr(self, "_port_map", None))
        if not multi and self._tunnel:
            return  # classic single-port: only the first listener matters

        def _unbound_ports() -> list[int]:
            seen = set()
            if self._tunnel:
                seen = set(self._tunnel.endpoints.values()) | {self._tunnel.remote_port}
            out = []
            for (host, port), listener in (getattr(self._conn, "_local_listeners", {}) or {}).items():
                if listener and port not in seen:
                    out.append(port)
            return sorted(out)

        ports = _unbound_ports()
        if not ports:
            await asyncio.sleep(1.0)
            ports = _unbound_ports()
        if not ports:
            logger.warning("Could not detect forwarded port for %s", self._peer)
            return

        async with self._setup_lock:
            ports = _unbound_ports()  # re-scan: another task may have consumed some
            if not ports:
                return
            if not multi:
                if not self._tunnel:
                    await self._setup_tunnel(ports[0])
                return
            # multi-port: first listener creates the tunnel, the rest map to
            # the remaining addresses in canonical order
            for i, port in enumerate(ports):
                if not self._tunnel:
                    await self._setup_tunnel(port)
                    continue
                addresses = self._tunnel.all_addresses()
                if i < len(addresses):
                    addr = addresses[i]
                    self._tunnel.endpoints[addr] = port
                    if i < len(self._port_map):
                        self._tunnel.local_ports[addr] = self._port_map[i]
                else:
                    logger.info("Extra listener %d ignored (no address left) for %s", port, self._peer)
            if self._tunnel:
                logger.info("Multi-port tunnel %s endpoints: %s (local %s)",
                            self._tunnel.subdomain, self._tunnel.endpoints, self._tunnel.local_ports)

    async def _setup_tunnel(self, remote_port: int) -> None:
        """Create the tunnel: use the token's fixed subdomain when set (v0.9.0),
        else allocate a random one; register in memory + DB."""
        if self._tunnel:
            return
        try:
            # Fixed subdomain when the token defines one (v0.9.0), else random
            subdomain = None
            if self._token:
                try:
                    from app.core.db import get_conn
                    async with get_conn() as db:
                        cur = await db.execute(
                            "SELECT fixed_subdomain, tunnel_mode, tcp_port FROM tokens WHERE token = %s",
                            (self._token,),
                        )
                        row = await cur.fetchone()
                        await cur.close()
                        if row and row[0]:
                            subdomain = row[0]
                            self._last_fixed_sub = subdomain
                        self._tunnel_mode = (row[1] if row else "http") or "http"
                        self._tcp_port = row[2] if row else None
                except Exception as e:
                    logger.debug("token lookup failed: %s", e)
            if not subdomain:
                subdomain = _generate_subdomain()

            # Collision: regenerate only random subdomains. A FIXED subdomain that
            # is somehow already live means the same token reconnected while its
            # old session lingers — drop the stale one and take it over.
            while is_subdomain_taken(subdomain):
                if self._token and subdomain == getattr(self, "_last_fixed_sub", None):
                    stale = await remove_tunnel(subdomain)
                    if stale and stale.ssh_conn:
                        try:
                            stale.ssh_conn.close()
                        except Exception:
                            pass
                    break
                subdomain = _generate_subdomain()

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
                custom_domain=self._custom_domain,
                custom_domains=list(getattr(self, "_custom_domains", []) or []),
                token=self._token or "",
                log_callback=self._info_session.write_log if self._info_session else None,
            )

            from app.core.db import get_conn
            async with get_conn() as db:
                # Delete any old DB record for this subdomain first
                cur = await db.execute(
                    "DELETE FROM tunnels WHERE subdomain = %s",
                    (subdomain,),
                )
                await cur.close()

                # Now insert the new tunnel (token links traffic stats to the token)
                cur = await db.execute(
                    """
                    INSERT INTO tunnels (tunnel_id, subdomain, remote_port, local_port,
                                         protocol, user_email, ssh_peer, status, token)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', %s)
                    """,
                    (tunnel_id, subdomain, remote_port, 0, "http", self._username, self._peer, self._token or None),
                )
                await cur.close()

            await register_tunnel(self._tunnel)

            # TCP mode (v1.0.0): open the public relay for this token's port
            if getattr(self, "_tunnel_mode", "http") == "tcp" and getattr(self, "_tcp_port", None):
                from app.core.tcp_relay import start_relay
                ok = await start_relay(self._tcp_port, remote_port, subdomain)
                self._relay_port = self._tcp_port if ok else None

            scheme = "https" if settings.PROXY_PORT == 80 else "http"
            url = f"{scheme}://{subdomain}.{settings.TUNNEL_DOMAIN}"
            custom_url = f"{scheme}://{self._custom_domain}" if self._custom_domain else ""
            logger.info("Tunnel created: %s → remote port %d (from %s)",
                        url, remote_port, self._peer)

            # Print to server console
            print(f"\n  ╔══════════════════════════════════════════════════════╗")
            print(f"  ║  tunnel — ACTIVE                                     ║")
            print(f"  ║  URL:  {url:<46s}║")
            if custom_url:
                print(f"  ║  Custom domain: {custom_url:<37s}║")
            # v1.9.0: per-address endpoints (multi-port)
            for addr, rport in sorted(self._tunnel.endpoints.items()):
                lp = self._tunnel.local_ports.get(addr, "?")
                print(f"  ║  endpoint: {addr:<30s} → local :{lp:<8d}║")
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
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
        if self._server._tunnel:
            self._server._tunnel.log_callback = self.write_log

    def shell_requested(self) -> bool:
        return True

    def exec_requested(self, command: str) -> bool:
        return False

    def write_log(self, message: str) -> None:
        """Write a log line to the user's terminal (called by the proxy and dashboard)."""
        if not self._chan:
            return
        try:
            self._chan.write(message + "\r\n")
        except Exception:
            pass

    def session_started(self) -> None:
        """Called when the session starts — try to send tunnel info."""
        # Schedule sending tunnel info (tunnel may not be ready yet)
        asyncio.create_task(self._send_info_when_ready())

    async def _send_info_when_ready(self) -> None:
        """Wait for the tunnel to be set up, then send the info to the client."""
        for _ in range(50):
            # Check for strict mode port mismatch error
            if getattr(self._server, "_port_mismatch_error", None) and not self._info_sent:
                err = self._server._port_mismatch_error
                is_missing = err.get("missing_port", False)
                given_str = ", ".join(f":{p}" for p in err.get("given", [])) or "None (missing --port)"
                expected_str = ", ".join(f":{p}" for p in err.get("expected", []))
                expected_p = err.get("expected", [8080])[0]

                if is_missing:
                    title = "❌ STRICT PORT CHECK: PORT REQUIRED IN COMMAND"
                    detail_line = f"  ║  Configured Port(s) on Web: {expected_str:<44s} ║"
                    info_line = "  ║  Please specify your configured port in your SSH command username.       ║"
                else:
                    title = "❌ PORT MISMATCH ERROR — CONNECTION REJECTED"
                    detail_line = f"  ║  Port in your command: {given_str:<15s} Configured on Web: {expected_str:<18s} ║"
                    info_line = "  ║  The port in your command does not match your dashboard configuration.   ║"

                lines = [
                    "",
                    "  ╔══════════════════════════════════════════════════════════════════════════╗",
                    f"  ║  {title:<72s} ║",
                    "  ╠══════════════════════════════════════════════════════════════════════════╣",
                    detail_line,
                    "  ║                                                                          ║",
                    info_line,
                    "  ║  Please connect with the matching port:                                  ║",
                    f"  ║    ssh -p 2222 -R0:127.0.0.1:{expected_p} {self._server._token}--{expected_p}@ssh.iraglobaltech.com",
                    "  ║                                                                          ║",
                    "  ║  Or update your port at: https://iraglobaltech.com/dashboard/tokens      ║",
                    "  ╚══════════════════════════════════════════════════════════════════════════╝",
                    "",
                ]
                data = "\r\n".join(lines) + "\r\n"
                if self._chan:
                    try:
                        self._chan.write(data)
                    except Exception:
                        pass
                self._info_sent = True
                await asyncio.sleep(1.2)
                self._cleanup_and_close()
                return

            if self._server._tunnel and not self._info_sent:
                tunnel = self._server._tunnel
                # Wait briefly to ensure all listener ports are registered
                await asyncio.sleep(0.4)
                scheme = "https"
                primary_url = f"{scheme}://{tunnel.subdomain}.{settings.TUNNEL_DOMAIN}"

                seen = set()
                saved_ports_map = {}
                if getattr(self._server, "_saved_multiport", None):
                    saved_ports_map = self._server._saved_multiport.get("ports", {})

                # Filter by explicitly connected ports on this connection
                connected_ports = set(getattr(self._server, "_port_map", []) or [])

                domain_list = []
                if saved_ports_map:
                    for d_name, d_info in saved_ports_map.items():
                        if isinstance(d_info, dict) and "port" in d_info:
                            try:
                                p_num = int(d_info["port"])
                                if not connected_ports or p_num in connected_ports:
                                    domain_list.append(d_name)
                            except Exception:
                                pass
                        elif not connected_ports:
                            domain_list.append(d_name)

                for addr in list(tunnel.endpoints.keys()) + list(tunnel.local_ports.keys()) + list(getattr(tunnel, "custom_domains", []) or []):
                    if addr and addr != tunnel.subdomain and addr != f"{tunnel.subdomain}.{settings.TUNNEL_DOMAIN}" and addr not in domain_list:
                        lp_val = tunnel.local_ports.get(addr)
                        try:
                            if not connected_ports or (lp_val and int(lp_val) in connected_ports):
                                domain_list.append(addr)
                        except Exception:
                            pass

                is_multi = len(domain_list) > 1 or len(connected_ports) > 1
                title_header = "IRAGT Multi-Port Tunnel — ACTIVE" if is_multi else "IRAGT Tunnel — ACTIVE"

                lines = [
                    "",
                    "  ╔══════════════════════════════════════════════════════════════════════════╗",
                    f"  ║  {title_header:<72s} ║",
                    "  ╠══════════════════════════════════════════════════════════════════════════╣",
                ]

                if domain_list:
                    for addr in domain_list:
                        if addr in seen:
                            continue
                        seen.add(addr)
                        addr_url = f"{scheme}://{addr}" if not addr.startswith("http") else addr
                        lp = tunnel.local_ports.get(addr) or (saved_ports_map.get(addr, {}).get("port") if saved_ports_map.get(addr) else None) or tunnel.local_port or "local"
                        p_stat = " [PAUSED]" if tunnel.is_endpoint_paused(addr) else ""
                        row_str = f"  🌐 {addr_url} -> :{lp}{p_stat}"
                        lines.append(f"  ║ {row_str:<72s} ║")
                else:
                    sub_lp = tunnel.local_ports.get(tunnel.subdomain) or tunnel.local_port or (list(connected_ports)[0] if connected_ports else "local")
                    sub_p = " [PAUSED]" if tunnel.is_endpoint_paused(tunnel.subdomain) else ""
                    row_str = f"  🌐 {primary_url} -> :{sub_lp}{sub_p}"
                    lines.append(f"  ║ {row_str:<72s} ║")

                lines += [
                    "  ╚══════════════════════════════════════════════════════════════════════════╝",
                    "",
                    "  💡 Manage & toggle ports live in your dashboard: https://iraglobaltech.com/dashboard",
                    "  Press Ctrl+C to stop the tunnel.",
                    "",
                ]
                data = "\r\n".join(lines) + "\r\n"
                if self._chan:
                    try:
                        self._chan.write(data)
                    except Exception:
                        pass
                self._info_sent = True
                logger.info("Tunnel info sent to client terminal")
                return
            await asyncio.sleep(0.2)

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
        # Do not close the channel on stdin EOF so the tunnel session remains active
        return False

    def close_received(self) -> None:
        pass


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

    def write_log(self, message: str) -> None:
        """Forward log lines to the connected client channel."""
        if self._info_session:
            self._info_session.write_log(message)

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
        # Update DB first, then remove from registry, so a DB failure leaves
        # the tunnel visible and retryable instead of creating a stale row.
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
            # Do not remove from registry if DB update failed; next cleanup or
            # takeover will retry.
            return
        await remove_tunnel(tunnel.subdomain)
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
        back to their terminal (IRAGT uses token-as-username auth)."""
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
        self._port_map = None
        base_token = token
        has_explicit_ports = False
        if "--" in token:
            base_token, _, ports_s = token.partition("--")
            try:
                self._port_map = [int(p) for p in ports_s.split(",") if p.strip()]
                if not self._port_map:
                    self._port_map = None
                else:
                    has_explicit_ports = True
            except ValueError:
                return False  # malformed suffix
        try:
            conn = psycopg.connect(settings.async_dsn, autocommit=True)

            # 1. Check tokens table (multi-token system — what the dashboard uses)
            try:
                cur = conn.execute(
                    "SELECT t.user_email, t.custom_domain, u.is_active, u.plan, t.local_port "
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
                    token_local_port = row[4] if len(row) > 4 else None
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

                    # v3.0.0: load saved multiport config (ports and enabled/paused states)
                    self._saved_multiport = None
                    self._initial_paused_endpoints = set()
                    configured_ports = set()
                    if token_local_port:
                        try:
                            configured_ports.add(int(token_local_port))
                        except Exception:
                            pass
                    try:
                        import json as _json
                        cur = conn.execute(
                            "SELECT config FROM tunnel_configs WHERE user_email = %s AND name = %s",
                            (self._username, f"multiport:{base_token}"),
                        )
                        mp_row = cur.fetchone()
                        cur.close()
                        if mp_row:
                            mp_cfg = _json.loads(mp_row[0]) if isinstance(mp_row[0], str) else mp_row[0]
                            self._saved_multiport = mp_cfg
                            ports_dict = mp_cfg.get("ports", {})
                            for addr_k, info_v in ports_dict.items():
                                norm = addr_k.strip().lower().split(":")[0]
                                if isinstance(info_v, dict) and info_v.get("enabled") is False:
                                    self._initial_paused_endpoints.add(norm)
                                if isinstance(info_v, dict) and "port" in info_v:
                                    try:
                                        configured_ports.add(int(info_v["port"]))
                                    except (ValueError, TypeError):
                                        pass
                    except Exception as e:
                        logger.debug("Failed to read saved multiport config: %s", e)

                    self._configured_ports = configured_ports
                    self._has_explicit_ports = has_explicit_ports
                    # Strict mode check:
                    self._port_mismatch_error = None
                    if configured_ports and has_explicit_ports:
                        invalid_ports = [p for p in self._port_map if p not in configured_ports]
                        if invalid_ports:
                            self._port_mismatch_error = {
                                "given": self._port_map,
                                "expected": sorted(list(configured_ports)),
                                "missing_port": False,
                            }
                            logger.warning("SSH port mismatch: %s requested %s, expected %s",
                                           self._username, self._port_map, configured_ports)

                    if not self._port_mismatch_error and not self._port_map and self._saved_multiport:
                        extracted_ports = []
                        ports_dict = self._saved_multiport.get("ports", {})
                        for addr_k, info_v in ports_dict.items():
                            if isinstance(info_v, dict) and "port" in info_v:
                                try:
                                    extracted_ports.append(int(info_v["port"]))
                                except (ValueError, TypeError):
                                    pass
                        if extracted_ports:
                            self._port_map = extracted_ports

                    # v2.7.8: multiport — load ALL the user's tokens' custom domains
                    # so one tunnel can serve every domain/subdomain on the account
                    if self._port_map or self._saved_multiport:
                        try:
                            cur = conn.execute(
                                "SELECT custom_domain FROM tokens "
                                "WHERE user_email = %s AND token != %s AND custom_domain IS NOT NULL",
                                (self._username, base_token),
                            )
                            for r in cur.fetchall():
                                if r[0] and r[0] not in self._custom_domains and r[0] != self._custom_domain:
                                    self._custom_domains.append(r[0])
                            cur.close()
                        except Exception:
                            pass
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
        """Wait for asyncssh to create listeners, then bind them in order to
        configured multiport addresses.

        Insertion order of self._conn._local_listeners matches the client's -R flags.
        """
        async with self._setup_lock:
            if getattr(self, "_port_mismatch_error", None):
                return
            # Poll for listeners
            all_listener_ports: list[int] = []
            for _attempt in range(50):
                if not self._conn:
                    return
                all_listener_ports = [
                    port for (host, port), listener in (getattr(self._conn, "_local_listeners", {}) or {}).items()
                    if listener
                ]
                if all_listener_ports:
                    break
                await asyncio.sleep(0.1)

            if not all_listener_ports:
                return

            cfg_ports = getattr(self, "_configured_ports", set()) or set()
            has_exp = getattr(self, "_has_explicit_ports", False)
            if not has_exp and len(cfg_ports) > 1 and len(all_listener_ports) < len(cfg_ports):
                self._port_mismatch_error = {
                    "given": [],
                    "expected": sorted(list(cfg_ports)),
                    "missing_port": True,
                }
                logger.warning("SSH strict port required: %s ran single-port SSH without specifying port (expected %s)",
                               self._username, cfg_ports)
                return

            if not self._tunnel:
                await self._setup_tunnel(all_listener_ports[0])
            if not self._tunnel:
                return

            saved_ports_map = {}
            if getattr(self, "_saved_multiport", None):
                saved_ports_map = self._saved_multiport.get("ports", {})

            target_addresses = []
            if saved_ports_map:
                if self._port_map:
                    for req_p in self._port_map:
                        for addr, info_v in saved_ports_map.items():
                            if isinstance(info_v, dict) and str(info_v.get("port", "")).strip() == str(req_p):
                                if addr not in target_addresses:
                                    target_addresses.append(addr)
                for addr in list(saved_ports_map.keys()) + [self._custom_domain] + list(getattr(self, "_custom_domains", []) or []):
                    if addr and addr not in target_addresses:
                        target_addresses.append(addr)
            else:
                if self._custom_domain:
                    target_addresses.append(self._custom_domain)
                for addr in list(getattr(self, "_custom_domains", []) or []):
                    if addr and addr not in target_addresses:
                        target_addresses.append(addr)

            if self._username:
                try:
                    import psycopg
                    conn2 = psycopg.connect(settings.async_dsn, autocommit=True)
                    cur2 = conn2.execute(
                        "SELECT custom_domain FROM tokens WHERE user_email = %s AND token != %s AND custom_domain IS NOT NULL",
                        (self._username, self._token),
                    )
                    for r in cur2.fetchall():
                        addr = r[0]
                        if addr and addr not in target_addresses:
                            target_addresses.append(addr)
                    cur2.close()
                    cur2 = conn2.execute(
                        "SELECT td.domain FROM token_domains td "
                        "JOIN tokens t ON t.id = td.token_id "
                        "WHERE t.user_email = %s AND t.token != %s",
                        (self._username, self._token),
                    )
                    for r in cur2.fetchall():
                        addr = r[0]
                        if addr and addr not in target_addresses:
                            target_addresses.append(addr)
                    cur2.close()
                    conn2.close()
                except Exception as e:
                    logger.warning("Could not load cross-token addresses: %s", e)

            for i, port in enumerate(all_listener_ports):
                if i < len(target_addresses):
                    addr = target_addresses[i]
                    self._tunnel.endpoints[addr] = port
                    lp = 0
                    if self._port_map and i < len(self._port_map):
                        lp = self._port_map[i]
                    elif saved_ports_map.get(addr):
                        try:
                            lp = int(saved_ports_map[addr].get("port", 0))
                        except Exception:
                            pass
                    if lp:
                        self._tunnel.local_ports[addr] = lp
                    if i == 0:
                        self._tunnel.remote_port = port
                        self._tunnel.endpoints[self._tunnel.subdomain] = port
                        self._tunnel.endpoints[f"{self._tunnel.subdomain}.{settings.TUNNEL_DOMAIN}"] = port
                        if lp:
                            self._tunnel.local_port = lp
                            self._tunnel.local_ports[self._tunnel.subdomain] = lp
                            self._tunnel.local_ports[f"{self._tunnel.subdomain}.{settings.TUNNEL_DOMAIN}"] = lp
                else:
                    logger.info("Extra listener %d mapped as fallback for %s", port, self._peer)

            if self._tunnel.subdomain not in self._tunnel.endpoints:
                self._tunnel.endpoints[self._tunnel.subdomain] = all_listener_ports[0]
                self._tunnel.endpoints[f"{self._tunnel.subdomain}.{settings.TUNNEL_DOMAIN}"] = all_listener_ports[0]

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
                    # Mark the stale DB row disconnected before inserting the new one.
                    try:
                        from app.core.db import get_conn
                        async with get_conn() as db:
                            cur = await db.execute(
                                "UPDATE tunnels SET status = 'disconnected', closed_at = now() "
                                "WHERE subdomain = %s AND status = 'active' AND closed_at IS NULL",
                                (subdomain,),
                            )
                            await cur.close()
                    except Exception:
                        pass
                    break
                subdomain = _generate_subdomain()

            tunnel_id = _generate_tunnel_id()

            paused_endpoints = set(getattr(self, "_initial_paused_endpoints", set()) or set())

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
                paused_endpoints=paused_endpoints,
                token=self._token or "",
                log_callback=self.write_log,
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
            print(f"  ║  IRAGT tunnel — ACTIVE                                ║")
            print(f"  ║  URL:  {url:<46s}║")
            if custom_url:
                print(f"  ║  Custom domain: {custom_url:<37s}║")
            # v1.9.0: per-address endpoints (multi-port)
            for addr, rport in sorted(self._tunnel.endpoints.items()):
                lp = self._tunnel.local_ports.get(addr, "?")
                print(f"  ║  endpoint: {addr:<30s} → local :{str(lp):<8s}║")
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
        reuse_address=True,
    )

    print(f"[ssh] Server listening on {settings.SSH_HOST}:{settings.SSH_PORT}")
    print(f"[ssh] Connect with: ssh -p {settings.SSH_PORT} -R0:localhost:PORT {settings.TUNNEL_DOMAIN}")
    return server

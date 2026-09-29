#!/usr/bin/env python3
"""IRAGT Multi-Region Edge Node Daemon.

Stateless edge agent that runs on remote regional servers:
1. Listens on SSH port 2222 for reverse port forwards (-R0:localhost:PORT)
2. Verifies developer tokens via Central Controller API (with local RAM cache)
3. Listens on HTTP port 80/8080 and proxies incoming web/websocket traffic
4. Sends periodic heartbeats and metrics to the Central Controller
"""
import argparse
import asyncio
import logging
import os
import random
import string
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import aiohttp
from aiohttp import web
import asyncssh
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("iragt-edge")


@dataclass
class EdgeSession:
    subdomain: str
    token: str
    user_email: str
    remote_port: int
    local_ports: dict[str, int] = field(default_factory=dict)
    endpoints: dict[str, int] = field(default_factory=dict)
    ssh_conn: Any = None
    created_at: float = field(default_factory=time.time)
    request_count: int = 0
    bytes_transferred: int = 0


class TokenCache:
    """Fast in-memory TTL cache for verified developer tokens."""

    def __init__(self, ttl: float = 60.0):
        self._ttl = ttl
        self._cache: dict[str, tuple[float, dict[str, Any]]] = {}

    def get(self, token: str) -> dict[str, Any] | None:
        now = time.monotonic()
        if token in self._cache:
            ts, val = self._cache[token]
            if now - ts < self._ttl:
                return val
            self._cache.pop(token, None)
        return None

    def set(self, token: str, data: dict[str, Any]) -> None:
        self._cache[token] = (time.monotonic(), data)


class EdgeAgent:
    def __init__(
        self,
        controller_url: str,
        node_secret: str,
        region_code: str,
        proxy_domain: str,
        ssh_port: int = 2222,
        http_port: int = 80,
    ):
        self.controller_url = controller_url.rstrip("/")
        self.node_secret = node_secret
        self.region_code = region_code.lower()
        self.proxy_domain = proxy_domain.lower()
        self.ssh_port = ssh_port
        self.http_port = http_port

        self.token_cache = TokenCache(ttl=60.0)
        self.tunnels: dict[str, EdgeSession] = {}  # subdomain/domain -> session
        self.port_to_session: dict[int, EdgeSession] = {}
        self.lock = asyncio.Lock()
        self.start_time = time.time()

    async def verify_token_remote(self, token: str) -> dict[str, Any] | None:
        """Call central controller to verify developer token and load multiport rules."""
        cached = self.token_cache.get(token)
        if cached is not None:
            return cached

        url = f"{self.controller_url}/api/v1/edge/verify-token"
        payload = {
            "token": token,
            "node_secret": self.node_secret,
            "region_code": self.region_code,
        }
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("valid"):
                        self.token_cache.set(token, data)
                        return data
                elif resp.status_code in (401, 403, 404):
                    logger.warning("Token verification rejected: %s (status %d)", token[:8], resp.status_code)
                    return None
        except Exception as e:
            logger.error("Error verifying token with controller %s: %s", url, e)
        return None

    def allocate_subdomain(self, length: int = 7) -> str:
        chars = string.ascii_lowercase + string.digits
        return "".join(random.choices(chars, k=length))

    async def register_session(self, session: EdgeSession):
        async with self.lock:
            self.tunnels[session.subdomain.lower()] = session
            self.tunnels[f"{session.subdomain.lower()}.{self.proxy_domain}"] = session
            for addr in session.endpoints:
                self.tunnels[addr.lower()] = session
            self.port_to_session[session.remote_port] = session

    async def remove_session(self, session: EdgeSession):
        async with self.lock:
            self.tunnels.pop(session.subdomain.lower(), None)
            self.tunnels.pop(f"{session.subdomain.lower()}.{self.proxy_domain}", None)
            for addr in session.endpoints:
                self.tunnels.pop(addr.lower(), None)
            self.port_to_session.pop(session.remote_port, None)

    # -------------------------------------------------------------
    # HTTP Reverse Proxy
    # -------------------------------------------------------------
    async def handle_http_proxy(self, request: web.Request) -> web.StreamResponse:
        if request.path == "/health":
            return web.json_response({
                "status": "ok",
                "region": self.region_code,
                "uptime": int(time.time() - self.start_time),
                "active_tunnels": len(set(self.tunnels.values())),
            })

        host = request.headers.get("Host", "").split(":")[0].strip().lower()
        sub = host.split(".")[0] if "." in host else host

        session = self.tunnels.get(host) or self.tunnels.get(sub)
        if not session:
            return web.Response(
                text=f"<h1>502 — Tunnel Not Found</h1><p>No active tunnel for host: <code>{host}</code> on edge node <b>{self.region_code}</b>.</p>",
                status_code=502,
                content_type="text/html",
            )

        # Target local reverse port
        target_port = session.endpoints.get(host) or session.endpoints.get(sub) or session.remote_port
        target_url = f"http://127.0.0.1:{target_port}{request.rel_url}"

        session.request_count += 1

        # Check for WebSocket upgrade
        if request.headers.get("Upgrade", "").lower() == "websocket":
            return await self._proxy_websocket(request, target_url)

        # Standard HTTP proxy streaming
        try:
            req_headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
            req_headers["X-Forwarded-For"] = request.remote or "127.0.0.1"
            req_headers["X-Forwarded-Proto"] = request.scheme
            req_headers["X-Real-IP"] = request.remote or "127.0.0.1"
            req_headers["Host"] = host

            body = await request.read()
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=180)) as client:
                async with client.request(
                    request.method,
                    target_url,
                    headers=req_headers,
                    data=body,
                    allow_redirects=False,
                ) as upstream_resp:
                    resp_headers = {k: v for k, v in upstream_resp.headers.items() if k.lower() not in ("transfer-encoding", "content-encoding")}
                    response = web.StreamResponse(status=upstream_resp.status, headers=resp_headers)
                    await response.prepare(request)
                    async for chunk in upstream_resp.content.iter_chunked(65536):
                        session.bytes_transferred += len(chunk)
                        await response.write(chunk)
                    await response.write_eof()
                    return response

        except Exception as e:
            logger.debug("Proxy error to port %s: %s", target_port, e)
            return web.Response(
                text=f"<h1>502 — Bad Gateway</h1><p>Failed to forward request to local tunnel port {target_port}: {e}</p>",
                status_code=502,
                content_type="text/html",
            )

    async def _proxy_websocket(self, request: web.Request, target_url: str) -> web.StreamResponse:
        ws_client = web.WebSocketResponse()
        await ws_client.prepare(request)

        ws_target = target_url.replace("http://", "ws://").replace("https://", "wss://")
        async with aiohttp.ClientSession() as session:
            try:
                async with session.ws_connect(ws_target) as ws_server:
                    async def client_to_server():
                        async for msg in ws_client:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await ws_server.send_str(msg.data)
                            elif msg.type == aiohttp.WSMsgType.BINARY:
                                await ws_server.send_bytes(msg.data)
                            elif msg.type == aiohttp.WSMsgType.CLOSE:
                                await ws_server.close()

                    async def server_to_client():
                        async for msg in ws_server:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await ws_client.send_str(msg.data)
                            elif msg.type == aiohttp.WSMsgType.BINARY:
                                await ws_client.send_bytes(msg.data)
                            elif msg.type == aiohttp.WSMsgType.CLOSE:
                                await ws_client.close()

                    await asyncio.gather(client_to_server(), server_to_client())
            except Exception as e:
                logger.debug("WebSocket proxy error: %s", e)
                await ws_client.close()
        return ws_client

    # -------------------------------------------------------------
    # Heartbeat Worker
    # -------------------------------------------------------------
    async def heartbeat_loop(self):
        url = f"{self.controller_url}/api/v1/edge/heartbeat"
        while True:
            await asyncio.sleep(15.0)
            try:
                payload = {
                    "node_secret": self.node_secret,
                    "region_code": self.region_code,
                    "active_tunnels": len(set(self.tunnels.values())),
                    "uptime_seconds": int(time.time() - self.start_time),
                }
                async with httpx.AsyncClient(timeout=4.0) as client:
                    await client.post(url, json=payload)
            except Exception as e:
                logger.debug("Heartbeat error: %s", e)


# -----------------------------------------------------------------
# AsyncSSH Server Handling
# -----------------------------------------------------------------
class EdgeSSHServerSession(asyncssh.SSHServerSession):
    def __init__(self, server: "EdgeSSHServer"):
        self.server = server
        self.chan: asyncssh.SSHServerChannel | None = None

    def connection_made(self, chan: asyncssh.SSHServerChannel) -> None:
        self.chan = chan

    def shell_requested(self) -> bool:
        return True

    def session_started(self) -> None:
        asyncio.create_task(self._send_banner_when_ready())

    async def _send_banner_when_ready(self):
        for _ in range(40):
            if self.server.session and self.chan:
                s = self.server.session
                await asyncio.sleep(0.3)
                scheme = "https"
                primary_url = f"{scheme}://{s.subdomain}.{self.server.agent.proxy_domain}"

                lines = [
                    "",
                    "  ╔══════════════════════════════════════════════════════════════════════════╗",
                    f"  ║  IRAGT Multi-Region Tunnel — ACTIVE ({self.server.agent.region_code.upper()})                           ║",
                    "  ╠══════════════════════════════════════════════════════════════════════════╣",
                ]
                if s.local_ports:
                    for addr, lp in s.local_ports.items():
                        full_addr = addr if "." in addr else f"{addr}.{self.server.agent.proxy_domain}"
                        row = f"  🌐 {scheme}://{full_addr} -> :{lp}"
                        lines.append(f"  ║ {row:<72s} ║")
                else:
                    row = f"  🌐 {primary_url} -> :local"
                    lines.append(f"  ║ {row:<72s} ║")

                lines += [
                    "  ╚══════════════════════════════════════════════════════════════════════════╝",
                    "",
                    "  💡 Traffic routed via regional edge PoP.",
                    "  Press Ctrl+C to stop the tunnel.",
                    "",
                ]
                try:
                    self.chan.write("\r\n".join(lines) + "\r\n")
                except Exception:
                    pass
                return
            await asyncio.sleep(0.2)

    def data_received(self, data: str, datatype: int) -> None:
        if "\x03" in data or data.strip().lower() == "q":
            if self.chan:
                self.chan.close()
            if self.server.conn:
                self.server.conn.close()


class EdgeSSHServer(asyncssh.SSHServer):
    def __init__(self, agent: EdgeAgent):
        self.agent = agent
        self.conn: asyncssh.SSHServerConnection | None = None
        self.session: EdgeSession | None = None
        self.token_info: dict[str, Any] | None = None
        self.auth_token: str = ""
        self._auth_failed: bool = False

    def connection_made(self, conn: asyncssh.SSHServerConnection) -> None:
        self.conn = conn

    async def begin_auth(self, username: str) -> bool:
        # Username format: TOKEN or TOKEN--3000,8080
        raw_token = (username or "").split("--")[0].strip()
        self.auth_token = raw_token

        if not raw_token:
            self._auth_failed = True
            return False

        # Asynchronously verify developer token against central controller
        self.token_info = await self.agent.verify_token_remote(raw_token)
        if self.token_info and self.token_info.get("valid"):
            logger.info("SSH auth OK for user %s on edge %s", self.token_info.get("user_email"), self.agent.region_code)
            self._auth_failed = False
            return False  # No further auth needed — auth succeeds!

        logger.warning("SSH auth failed for token %s on edge %s", raw_token[:8], self.agent.region_code)
        self._auth_failed = True
        return False

    def password_auth_supported(self) -> bool:
        return False

    def public_key_auth_supported(self) -> bool:
        return False

    def session_requested(self) -> bool:
        if self._auth_failed or not self.token_info:
            return False
        return EdgeSSHServerSession(self)

    def server_requested(self, listen_host: str, listen_port: int) -> bool:
        if self._auth_failed or not self.token_info:
            return False
        asyncio.create_task(self._setup_tunnel())
        return True

    async def _setup_tunnel(self):
        for _ in range(40):
            listeners = getattr(self.conn, "_local_listeners", {})
            if listeners:
                break
            await asyncio.sleep(0.1)

        listeners = getattr(self.conn, "_local_listeners", {})
        if not listeners:
            return

        listener_ports = [port for (h, port) in listeners.keys()]
        if not listener_ports:
            return

        remote_port = listener_ports[0]
        subdomain = self.token_info.get("fixed_subdomain") or self.agent.allocate_subdomain()

        session = EdgeSession(
            subdomain=subdomain,
            token=self.auth_token,
            user_email=self.token_info.get("user_email", ""),
            remote_port=remote_port,
            ssh_conn=self.conn,
        )

        # Multi-port domain mapping
        ports_cfg = self.token_info.get("ports", [])
        if ports_cfg and len(listener_ports) >= len(ports_cfg):
            for i, p_info in enumerate(ports_cfg):
                if i < len(listener_ports):
                    addr = p_info["domain"]
                    lp = p_info["local_port"]
                    session.endpoints[addr] = listener_ports[i]
                    session.local_ports[addr] = lp
        else:
            session.endpoints[subdomain] = remote_port
            session.endpoints[f"{subdomain}.{self.agent.proxy_domain}"] = remote_port
            session.local_ports[subdomain] = 8080

        self.session = session
        await self.agent.register_session(session)

    def connection_lost(self, exc: Exception | None) -> None:
        if self.session:
            asyncio.create_task(self.agent.remove_session(self.session))


# -----------------------------------------------------------------
# Main Entry Point
# -----------------------------------------------------------------
async def main():
    parser = argparse.ArgumentParser(description="IRAGT Multi-Region Edge Daemon")
    parser.add_argument("--controller", required=True, help="Main Controller URL (e.g. https://iraglobaltech.com)")
    parser.add_argument("--token", required=True, help="Node Registration Secret")
    parser.add_argument("--region", required=True, help="Region Code (e.g. us, eu, in)")
    parser.add_argument("--domain", default="iraglobaltech.com", help="Regional Domain (e.g. us.iraglobaltech.com)")
    parser.add_argument("--ssh-port", type=int, default=2222, help="SSH Listen Port (default 2222)")
    parser.add_argument("--http-port", type=int, default=80, help="HTTP Proxy Listen Port (default 80)")
    args = parser.parse_args()

    agent = EdgeAgent(
        controller_url=args.controller,
        node_secret=args.token,
        region_code=args.region,
        proxy_domain=args.domain if args.domain != "iraglobaltech.com" else f"{args.region}.{args.domain}",
        ssh_port=args.ssh_port,
        http_port=args.http_port,
    )

    logger.info("Starting IRAGT Edge Node [%s] for domain *.%s", agent.region_code.upper(), agent.proxy_domain)

    # 1. Start SSH listener
    # Ensure persistent SSH host key exists (prevents host key mismatch warnings on reconnect)
    key_path = "/etc/iragt-edge/ssh_host_key"
    host_keys = None
    if not os.path.exists(key_path):
        try:
            os.makedirs(os.path.dirname(key_path), exist_ok=True)
            key = asyncssh.generate_private_key("ssh-ed25519")
            key.write_private_key(key_path)
            key.write_public_key(key_path + ".pub")
            logger.info("Generated persistent SSH host key at %s", key_path)
            host_keys = [key_path]
        except Exception as e:
            logger.warning("Could not persist host key to %s: %s (using ephemeral key)", key_path, e)
            host_keys = [asyncssh.generate_private_key("ssh-ed25519")]
    else:
        host_keys = [key_path]

    ssh_server = await asyncssh.create_server(
        lambda: EdgeSSHServer(agent),
        host="",
        port=agent.ssh_port,
        server_host_keys=host_keys,
    )
    logger.info("SSH Server listening on port %d", agent.ssh_port)

    # 2. Start HTTP Proxy listener
    app = web.Application()
    app.router.add_route("*", "/{tail:.*}", agent.handle_http_proxy)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host="0.0.0.0", port=agent.http_port)
    await site.start()
    logger.info("HTTP Proxy listening on port %d", agent.http_port)

    # 3. Start Heartbeat worker
    asyncio.create_task(agent.heartbeat_loop())

    # Keep alive
    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("Shutting down edge node...")
        ssh_server.close()
        await ssh_server.wait_closed()
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())

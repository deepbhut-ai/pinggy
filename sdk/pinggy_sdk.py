"""IRAGT Tunnel Python SDK — manage tunnels, tokens & domains programmatically.

Usage:
    from sdk.pinggy_sdk import TunnelClient

    client = TunnelClient("https://iraglobaltech.com", api_key="pk_...")
    print(client.tokens())                       # list tokens
    t = client.create_token(name="ci", fixed_subdomain="ci-run")
    print(client.tunnels())                      # live + history
    client.stop_tunnel("ci-run")                 # stop a live tunnel

Requires only `requests` (install: pip install requests).
"""
from __future__ import annotations

import json
import urllib.request
from typing import Any


class TunnelError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(f"HTTP {status}: {detail}")
        self.status = status
        self.detail = detail


class TunnelClient:
    def __init__(self, base_url: str, api_key: str):
        self.base = base_url.rstrip("/")
        self.api_key = api_key

    # ---- internals ----
    def _call(self, method: str, path: str, body: dict | None = None) -> Any:
        url = f"{self.base}/api/v1{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("X-Api-Key", self.api_key)
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            try:
                detail = json.loads(e.read().decode()).get("detail", str(e))
            except Exception:
                detail = str(e)
            raise TunnelError(e.code, detail) from None

    # ---- API keys ----
    def apikeys(self) -> list[dict]:
        """List your API keys (requires JWT-style session? No — uses the same key;
        returns keys owned by the key's owner)."""
        return self._call("GET", "/apikeys")

    # ---- tunnels ----
    def tunnels(self) -> dict:
        """Live tunnels + recent history."""
        return self._call("GET", "/manage/tunnels")

    def stop_tunnel(self, subdomain: str) -> dict:
        return self._call("POST", f"/manage/tunnels/{subdomain}/stop")

    # ---- tokens ----
    def tokens(self) -> list[dict]:
        return self._call("GET", "/manage/tokens")

    def create_token(self, name: str = "API token",
                     fixed_subdomain: str | None = None,
                     custom_domain: str | None = None) -> dict:
        return self._call("POST", "/manage/tokens", {
            "name": name, "fixed_subdomain": fixed_subdomain, "custom_domain": custom_domain,
        })

    def delete_token(self, token_id: str) -> dict:
        return self._call("DELETE", f"/manage/tokens/{token_id}")

    # ---- info ----
    def ssh_command(self, token: str, port: int = 8080) -> str:
        """Build the SSH command for a token."""
        host = self.base.split("//", 1)[-1]
        return f"ssh -p 2222 -R0:localhost:{port} -o StrictHostKeyChecking=no {token}@ssh.{host}"

    def plans(self) -> list[dict]:
        return self._call("GET", "/plans")


    # ---- supervisor (v1.12.0) ----
    def watch(self, token: str, ports: list[int] | None = None,
              retry_base: float = 1.0, retry_max: float = 30.0,
              on_event=None, forever: bool = True) -> None:
        """Keep a tunnel alive forever (SDK supervisor).

        Runs `ssh` with keep-alive, reconnects with exponential backoff on any
        drop, and re-randomizes nothing (fixed subdomains keep their address).
        Multi-port: pass ports=[3000, 8000] to map each address to its own
        local port (username TOKEN--p1,p2, v1.9.0).

        on_event(kind, detail) callback receives "up", "down", "retry".
        """
        import shutil
        import signal
        import subprocess
        import time as _time

        ssh = shutil.which("ssh")
        if not ssh:
            raise TunnelError(500, "ssh binary not found on PATH")

        host = self.base.split("//", 1)[-1]
        user = token if not ports else f"{token}--{','.join(str(p) for p in ports)}"
        cmd = [ssh, "-p", "2222",
               "-o", "StrictHostKeyChecking=no",
               "-o", "ServerAliveInterval=30",
               "-o", "ServerAliveCountMax=3",
               "-o", "ExitOnForwardFailure=yes"]
        targets = ports if ports else [8080]
        for p in targets:
            cmd += ["-R0:127.0.0.1:%d" % p]
        cmd += [f"{user}@ssh.{host}"]

        backoff = retry_base
        stop = {"flag": False}

        def _sig(_s, _f):
            stop["flag"] = True

        signal.signal(signal.SIGINT, _sig)
        signal.signal(signal.SIGTERM, _sig)

        def emit(kind, detail=""):
            if on_event:
                try:
                    on_event(kind, detail)
                except Exception:
                    pass

        while not stop["flag"]:
            emit("up" if backoff == retry_base else "retry", "connecting")
            try:
                proc = subprocess.Popen(cmd)
                emit("up", f"pid={proc.pid}")
                proc.wait()
            except FileNotFoundError:
                raise
            emit("down", f"exit={proc.returncode}")
            if not forever or stop["flag"]:
                break
            _time.sleep(backoff)
            backoff = min(backoff * 2, retry_max)
        emit("down", "supervisor stopped")

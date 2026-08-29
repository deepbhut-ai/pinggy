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

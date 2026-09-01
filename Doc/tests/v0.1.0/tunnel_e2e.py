"""Tunnel E2E test — proves local tunnel flow works end-to-end.

Usage:
    (.venv/bin/python -m http.server 9090 &)   # target service
    TOKEN=$(psql "postgresql://postgres:root@localhost:5432/pinggy" -tAc \
        "SELECT tunnel_token FROM users WHERE email='support@callingagents.in'")
    TOKEN=$TOKEN APP_PORT=8020 .venv/bin/python Doc/tests/v0.1.0/tunnel_e2e.py

Flow: SSH connect (username=tunnel token) → reverse forward → read assigned subdomain
from DB → GET http://{sub}.localhost:{APP_PORT}/ → expect the http.server listing.
"""
import asyncio
import os
import urllib.request

import asyncssh
import psycopg

DB = "postgresql://postgres:root@localhost:5432/pinggy"
PORT = os.environ.get("APP_PORT", "8020")


async def main() -> None:
    token = os.environ["TOKEN"]
    print(f"[1] connecting SSH localhost:2222 as token {token[:6]}...")
    async with asyncssh.connect("localhost", port=2222, known_hosts=None, username=token) as conn:
        print("[2] SSH authenticated; requesting remote forward 0 -> localhost:9090")
        listener = await conn.forward_remote_port("", 0, "localhost", 9090)
        remote_port = listener.get_port()
        print(f"[3] server listening on remote port {remote_port}; waiting for registration...")
        await asyncio.sleep(2)

        with psycopg.connect(DB) as db, db.cursor() as cur:
            cur.execute(
                "SELECT subdomain FROM tunnels WHERE remote_port=%s ORDER BY created_at DESC LIMIT 1",
                (remote_port,),
            )
            row = cur.fetchone()
        assert row, "no tunnels row found for remote port"
        sub = row[0]
        url = f"http://{sub}.localhost:{PORT}/"
        print(f"[4] tunnel URL: {url}")

        # NB: fetch from a worker thread — urlopen would block the event loop that
        # must service the incoming SSH channel for the forwarded connection.
        def fetch():
            with urllib.request.urlopen(url, timeout=10) as resp:
                return resp.status, resp.read().decode()

        status, body = await asyncio.to_thread(fetch)
        print(f"[5] HTTP {status} via tunnel, {len(body)} bytes")
        assert status == 200, f"expected 200, got {status}"
        assert "Directory listing" in body, "unexpected body (http.server listing expected)"
        print("PASS: tunnel E2E OK (SSH auth -> reverse forward -> subdomain proxy)")


if __name__ == "__main__":
    asyncio.run(main())

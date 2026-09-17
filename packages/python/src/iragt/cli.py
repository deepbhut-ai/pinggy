#!/usr/bin/env python3
"""IRAGT Tunnel CLI - Connect to your IRAGT multi-port tunnel with zero flags."""
import os
import sys
import json
import subprocess
import urllib.request
import urllib.error

API_BASE = os.environ.get("IRAGT_API_HOST", "https://iraglobaltech.com")
VERSION = "1.0.2"


def main():
    args = sys.argv[1:]
    command = args[0] if len(args) > 0 else ""
    token = ""

    if command in ("--version", "-v"):
        print(f"iragt v{VERSION}")
        sys.exit(0)

    if command in ("--help", "-h"):
        print("\n╔═════════════════════════════════════════════════════════════╗")
        print("║                   IRAGT TUNNEL CLI                          ║")
        print("╚═════════════════════════════════════════════════════════════╝")
        print("\nUsage:")
        print("  iragt connect <YOUR_TOKEN>    Connect your multiport tunnel")
        print("  iragt <YOUR_TOKEN>            Shortcut connect")
        print("  iragt --version               Show CLI version")
        print("  iragt --help                  Show this help message\n")
        print("Dashboard: https://iraglobaltech.com/dashboard\n")
        sys.exit(0)

    if command == "connect" and len(args) > 1:
        token = args[1]
    elif command and not command.startswith("-") and len(args) == 1:
        token = command
    else:
        print("\n╔═════════════════════════════════════════════════════════════╗")
        print("║                   IRAGT TUNNEL CLI                          ║")
        print("╚═════════════════════════════════════════════════════════════╝")
        print("\nUsage:")
        print("  iragt connect <YOUR_TOKEN>")
        print("  iragt <YOUR_TOKEN>\n")
        print("Dashboard: https://iraglobaltech.com/dashboard\n")
        sys.exit(1)

    token_display = f"{token[:8]}..." if len(token) > 8 else token
    print(f"\n🚀 Fetching tunnel configuration for token: {token_display}")

    api_url = f"{API_BASE}/api/v1/configs/cli/{token}"

    try:
        req = urllib.request.Request(
            api_url,
            headers={"User-Agent": f"iragt-python-cli/{VERSION}"}
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_msg = f"HTTP {e.code}"
        try:
            err_body = json.loads(e.read().decode("utf-8"))
            err_msg = err_body.get("detail", err_msg)
        except Exception:
            pass
        print(f"\n❌ Error: {err_msg}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Connection error: {e}\n")
        sys.exit(1)

    if data.get("status") != "success":
        print(f"\n❌ Error: {data.get('detail', 'Invalid token')}\n")
        sys.exit(1)

    ports = data.get("ports", [])
    ssh_host = data.get("ssh_host", "ssh.iraglobaltech.com")
    ssh_port = data.get("ssh_port", 2222)

    print("\n  ╔══════════════════════════════════════════════════════════════════════════╗")
    print("  ║                     IRAGT MULTI-PORT TUNNEL                              ║")
    print("  ╠══════════════════════════════════════════════════════════════════════════╣")
    for p in ports:
        domain_str = f"https://{p['domain']}"
        paused_str = " [PAUSED]" if p.get("enabled") is False else ""
        row_str = f"  🌐 {domain_str} -> :{p['local_port']}{paused_str}"
        print(f"  ║ {row_str:<72s} ║")
    print("  ╚══════════════════════════════════════════════════════════════════════════╝")
    print("  💡 Manage & toggle ports live in your dashboard: https://iraglobaltech.com/dashboard\n")

    ssh_cmd = ["ssh", "-p", str(ssh_port), "-o", "StrictHostKeyChecking=no"]
    for p in ports:
        ssh_cmd.extend(["-R", f"0:127.0.0.1:{p['local_port']}"])
    ssh_cmd.append(f"{token}@{ssh_host}")

    try:
        subprocess.run(ssh_cmd)
    except KeyboardInterrupt:
        print("\nTunnel disconnected.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""IRAGT Tunnel CLI - Connect to your IRAGT multi-port tunnel with zero flags and auto-sync."""
import os
import sys
import json
import time
import signal
import threading
import subprocess
import urllib.request
import urllib.error

API_BASE = os.environ.get("IRAGT_API_HOST", "https://iraglobaltech.com")
VERSION = "1.0.2"


def fetch_config(token: str) -> dict:
    api_url = f"{API_BASE}/api/v1/configs/cli/{token}"
    req = urllib.request.Request(
        api_url,
        headers={"User-Agent": f"iragt-python-cli/{VERSION}"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_ports_sig(ports: list) -> str:
    return "|".join(sorted(f"{p.get('domain')}:{p.get('local_port')}" for p in ports))


def print_banner(ports: list):
    print("\n  ╔══════════════════════════════════════════════════════════════════════════╗")
    print("  ║                     IRAGT MULTI-PORT TUNNEL                              ║")
    print("  ╠══════════════════════════════════════════════════════════════════════════╣")
    for p in ports:
        domain_str = f"https://{p.get('domain')}"
        paused_str = " [PAUSED]" if p.get("enabled") is False else ""
        row_str = f"  🌐 {domain_str} -> :{p.get('local_port')}{paused_str}"
        print(f"  ║ {row_str:<72s} ║")
    print("  ╚══════════════════════════════════════════════════════════════════════════╝")
    print("  💡 Manage & toggle ports live in your dashboard: https://iraglobaltech.com/dashboard\n")


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

    try:
        data = fetch_config(token)
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

    state = {
        "current_process": None,
        "current_ports": data.get("ports", []),
        "current_sig": get_ports_sig(data.get("ports", [])),
        "is_reloading": False,
        "is_running": True,
    }

    print_banner(state["current_ports"])

    def launch_ssh(cfg, is_reload=False):
        ports = cfg.get("ports", [])
        ssh_host = cfg.get("ssh_host", "ssh.iraglobaltech.com")
        ssh_port = cfg.get("ssh_port", 2222)

        if is_reload:
            old_domains = {p["domain"] for p in state["current_ports"]}
            added = [p for p in ports if p["domain"] not in old_domains]
            for p in added:
                print(f"\n  [dashboard] ➕ Added endpoint: https://{p['domain']} -> :{p['local_port']}")

        state["current_ports"] = ports
        state["current_sig"] = get_ports_sig(ports)

        ssh_cmd = ["ssh", "-p", str(ssh_port), "-tt", "-o", "StrictHostKeyChecking=no"]
        for p in ports:
            ssh_cmd.extend(["-R", f"0:127.0.0.1:{p['local_port']}"])
        ssh_cmd.append(f"{token}@{ssh_host}")

        state["current_process"] = subprocess.Popen(ssh_cmd)

    def watcher():
        while state["is_running"]:
            time.sleep(3)
            if not state["is_running"]:
                break
            try:
                fresh = fetch_config(token)
                fresh_sig = get_ports_sig(fresh.get("ports", []))
                if fresh_sig and fresh_sig != state["current_sig"]:
                    state["is_reloading"] = True
                    if state["current_process"]:
                        state["current_process"].terminate()
                        try:
                            state["current_process"].wait(timeout=2)
                        except Exception:
                            pass
                    time.sleep(0.5)
                    launch_ssh(fresh, is_reload=True)
                    state["is_reloading"] = False
            except Exception:
                pass

    launch_ssh(data, is_reload=False)

    w_thread = threading.Thread(target=watcher, daemon=True)
    w_thread.start()

    def handle_signal(sig, frame):
        state["is_running"] = False
        if state["current_process"]:
            try:
                state["current_process"].terminate()
            except Exception:
                pass
        print("\nTunnel disconnected.")
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    while state["is_running"]:
        if state["current_process"]:
            ret = state["current_process"].poll()
            if ret is not None and not state["is_reloading"]:
                print("\nTunnel disconnected.")
                break
        time.sleep(0.5)


if __name__ == "__main__":
    main()

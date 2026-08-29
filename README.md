## 🖥️ Production Server (Bare Metal / Systemd)

The live production deployment uses **systemd** on a bare metal server.

| Detail | Value |
|--------|-------|
| **Server IP** | `13.140.131.204` |
| **Domain** | `iraglobaltech.com` (Cloudflare proxied) |
| **Project path** | `/opt/pinggy` |
| **Deployment method** | Systemd service (`pinggy.service`) |
| **Service file** | `/etc/systemd/system/pinggy.service` |
| **Process** | `/opt/pinggy/.venv/bin/python /opt/pinggy/run.py` |
| **Python env** | `/opt/pinggy/.venv/` (virtualenv) |
| **Config** | `/opt/pinggy/.env` (EnvironmentFile) |
| **Auto-restart** | `Restart=always`, `RestartSec=5` |
| **Logs** | `journalctl -u pinggy` |

### Ports

| Port | Service | Bound to | Purpose |
|------|---------|----------|---------|
| `2222` | SSH tunnel server (asyncssh) | `0.0.0.0` (public) | SSH reverse tunnels |
| `8000` | FastAPI app (uvicorn) | `127.0.0.1` (localhost) | API + proxy (nginx fronts) |
| `80` | Nginx reverse proxy | `0.0.0.0` (public) | HTTP → FastAPI |

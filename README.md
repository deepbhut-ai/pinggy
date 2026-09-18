## 🖥️ Production Server (Bare Metal / Systemd)

The live production deployment uses **systemd** on a bare metal server.

| Detail | Value |
|--------|-------|
| **Server IP** | `13.140.131.204` |
| **Domain** | `iraglobaltech.com` (Cloudflare proxied) |
| **Project path** | `/opt/iragt` |
| **Deployment method** | Systemd service (`iragt.service`) |
| **Service file** | `/etc/systemd/system/iragt.service` |
| **Process** | `/opt/iragt/.venv/bin/python /opt/iragt/run.py` |
| **Python env** | `/opt/iragt/.venv/` (virtualenv) |
| **Config** | `/opt/iragt/.env` (EnvironmentFile) |
| **Auto-restart** | `Restart=always`, `RestartSec=5` |
| **Logs** | `journalctl -u iragt` |

### Ports

| Port | Service | Bound to | Purpose |
|------|---------|----------|---------|
| `2222` | SSH tunnel server (asyncssh) | `0.0.0.0` (public) | SSH reverse tunnels |
| `8000` | FastAPI app (uvicorn) | `127.0.0.1` (localhost) | API + proxy (nginx fronts) |
| `80` | Nginx reverse proxy | `0.0.0.0` (public) | HTTP → FastAPI |

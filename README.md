# pinggy — SSH Tunnel Service

A **pinggy.io / ngrok alternative** built with FastAPI + PostgreSQL.
Exposes local development servers to the internet via SSH reverse tunnels.

```
ssh -p 2222 -R0:localhost:8080 xyz.com
→ https://k7m3x9a.xyz.com  (auto-generated, HTTPS, live)
```

**Features:**
- 🔗 SSH-based tunnels (no custom client — just use `ssh`)
- 🌐 Auto-generated subdomains with wildcard SSL
- 🔐 JWT auth with admin/user roles
- 📊 Admin web panel (dashboard, users, tunnels, API explorer)
- 🗄️ PostgreSQL with auto-setup (DB + migrations + default admin)
- 🐳 Docker + docker-compose support
- 🚀 One-command deployment script

**Tech:** FastAPI · psycopg3 (async) · asyncssh · httpx · Alembic · PyJWT · bcrypt

## Project structure

```
pinggy/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app + lifespan (pool + SSH server)
│   ├── core/
│   │   ├── config.py         # pydantic-settings (reads .env)
│   │   ├── db.py              # psycopg3 AsyncConnectionPool
│   │   ├── security.py        # bcrypt + PyJWT
│   │   ├── deps.py            # FastAPI dependencies (get_db, admin guard)
│   │   ├── auto_setup.py      # auto-create DB + migrations + default admin
│   │   ├── ssh_server.py      # asyncssh SSH server (tunnel connections)
│   │   ├── tunnel_registry.py # in-memory tunnel state (subdomain → port)
│   │   └── proxy.py           # HTTP proxy middleware (subdomain routing)
│   ├── schemas/
│   │   ├── auth.py            # UserCreate / UserLogin / Token / UserOut
│   │   └── tunnel.py          # TunnelOut
│   ├── static/
│   │   └── admin.html         # Admin web panel (vanilla JS)
│   └── api/
│       ├── router.py          # aggregates routers
│       └── routers/
│           ├── auth.py        # /auth/register /auth/login /auth/me
│           ├── users.py       # /users (admin only)
│           ├── tunnels.py     # /tunnels (admin only)
│           └── admin.py       # /admin web panel
├── alembic/
│   ├── env.py                # SQLAlchemy engine + psycopg3 driver
│   ├── script.py.mako
│   └── versions/
│       ├── 0001_create_users.py
│       ├── 0002_add_role_and_admin.py
│       └── 0003_create_tunnels.py
├── nginx/
│   ├── pinggy.conf           # nginx wildcard *.domain config
│   └── setup-ssl.sh          # Let's Encrypt wildcard cert script
├── deploy/
│   └── pinggy.service        # systemd service file
├── alembic.ini
├── requirements.txt
├── run.py                    # dev server: python run.py
├── deploy.sh                 # one-command deployment script
├── Dockerfile                # container build
├── docker-compose.yml        # full stack (app + db + nginx)
├── test_tunnel_client.py     # test SSH tunnel client
├── .env.example
└── .gitignore
```

## Auto-Setup (Zero-Config Deploy)

The app **automatically** creates the database, enables extensions, and runs
all migrations on startup. You do **NOT** need to manually run `CREATE DATABASE`
or `alembic upgrade head` — just start the server and everything is set up.

### What happens on startup

1. **Connects** to PostgreSQL using the `postgres` maintenance database
2. **Creates** the target database (from `POSTGRES_DB`) if it doesn't exist
3. **Enables** the `pgcrypto` extension (for `gen_random_uuid()`)
4. **Runs** all Alembic migrations to `head`
5. **Creates** a default admin user if no users exist:
   - Username: `admin`
   - Password: `admin`
   - Role: `admin`
   - **⚠️ Change this password immediately after first login!**
6. **Initializes** the async connection pool
7. **Starts** serving requests

### Deploying to a new server

On any fresh server, you only need:

1. Install Python 3.12+ and PostgreSQL
2. Create a `.env` file (copy `.env.example`, set `POSTGRES_PASSWORD` etc.)
3. `pip install -r requirements.txt`
4. `python run.py`

The first startup will auto-create everything. No manual DB steps needed.

### How it works

The auto-setup logic is in `app/core/auto_setup.py` and runs in the FastAPI
lifespan **before** the connection pool is initialized:

```
run_auto_setup()      # sync: create DB + extensions + migrations + default admin
  → _ensure_database()     # CREATE DATABASE IF NOT EXISTS
  → _ensure_extensions()   # CREATE EXTENSION pgcrypto
  → _run_migrations()      # alembic upgrade head
  → _ensure_default_admin() # INSERT admin/admin if no users exist
await init_pool()     # async: open connection pool
```

> **Note:** The PostgreSQL user in `.env` must have `CREATEDB` privilege
> (the default `postgres` superuser has this). If using a restricted user,
> create the database manually first — auto-setup will skip creation and
> only run migrations.

---

## Setup — Windows

> **Prerequisites:** Python 3.12+, PostgreSQL 14+ installed and running.

### 1. Create a virtualenv and install

```powershell
# Create venv
python -m venv .venv

# Activate (PowerShell)
.\.venv\Scripts\Activate.ps1
# Or activate (cmd)
.\.venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements.txt
```

> If PowerShell blocks the activate script, run:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### 2. Configure environment

```powershell
Copy-Item .env.example .env
# Edit .env: set POSTGRES_PASSWORD, POSTGRES_DB, JWT_SECRET
notepad .env
```

### 3. Create the database (optional — auto-setup does this)

> **Skip this step** if you want the app to auto-create the database on
> first startup. Only do this manually if you prefer.

```powershell
# If psql is in PATH:
psql -U postgres -c "CREATE DATABASE pinggy;"
psql -U postgres -d pinggy -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# If psql is NOT in PATH (e.g. PostgreSQL 18 default install):
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE pinggy;"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d pinggy -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

### 4. Run migrations (optional — auto-setup does this)

> **Skip this step** — migrations run automatically on first startup.
> Only run manually if you want to apply migrations outside the app.

```powershell
alembic upgrade head
```

### 5. Start the server

```powershell
python run.py
# or: uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000/docs for Swagger UI.

> **Windows note:** `run.py` automatically sets `WindowsSelectorEventLoopPolicy`
> which is required for psycopg3 async on Windows. If you start uvicorn
> directly (not via `run.py`), you must set this policy yourself or the DB
> pool will fail with `ProactorEventLoop` errors.

---

## Setup — Linux (Ubuntu / Debian)

> **Prerequisites:** Python 3.12+, PostgreSQL 14+ installed and running.

### 1. Install system packages

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip postgresql postgresql-contrib
```

### 2. Create a virtualenv and install

```bash
# Create venv
python3 -m venv .venv

# Activate
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, POSTGRES_DB, JWT_SECRET
nano .env
```

### 4. Create the database (optional — auto-setup does this)

> **Skip this step** if you want the app to auto-create the database on
> first startup. Only do this manually if you prefer.

```bash
# Switch to postgres user and create DB + extension
sudo -u postgres psql <<EOF
CREATE DATABASE pinggy;
\c pinggy
CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOF
```

Or step by step:

```bash
sudo -u postgres psql
# In psql prompt:
# CREATE DATABASE pinggy;
# \c pinggy
# CREATE EXTENSION IF NOT EXISTS pgcrypto;
# \q
```

### 5. Run migrations (optional — auto-setup does this)

> **Skip this step** — migrations run automatically on first startup.
> Only run manually if you want to apply migrations outside the app.

```bash
alembic upgrade head
```

### 6. Start the server

```bash
python run.py
# or: uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000/docs for Swagger UI.

> **Linux note:** The `WindowsSelectorEventLoopPolicy` in `run.py` is
> automatically skipped on Linux (guarded by `sys.platform == "win32"`),
> so it has no effect — Linux uses the default `SelectorEventLoop` which
> psycopg3 supports natively.

---

## Setup — Linux (Docker / docker-compose)

If you prefer to run everything in containers, use this `docker-compose.yml`:

```yaml
version: "3.9"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: root
      POSTGRES_DB: pinggy
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  app:
    build: .
    ports:
      - "8000:8000"
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql+psycopg://postgres:root@db:5432/pinggy
      JWT_SECRET: dev-secret-change-in-production

volumes:
  pgdata:
```

Then:

```bash
docker compose up --build
# In another terminal, run migrations:
docker compose exec app alembic upgrade head
```

## API endpoints

| Method | Path                       | Auth     | Description          |
|--------|----------------------------|----------|----------------------|
| GET    | `/health`                  | —        | Health check         |
| GET    | `/admin`                   | —        | Admin web panel      |
| POST   | `/api/v1/auth/login`        | —        | Login, returns token |
| GET    | `/api/v1/auth/me`           | JWT      | Current user         |
| POST   | `/api/v1/auth/register`    | Admin    | Create user (admin only) |
| GET    | `/api/v1/users`             | Admin    | List all users       |
| GET    | `/api/v1/users/{user_id}`   | Admin    | Get user by id       |

## Roles & Permissions

Users have a `role` column (`admin` or `user`):

| Role   | Can login | Can view own profile | Can list/view users | Can create users |
|--------|-----------|---------------------|---------------------|------------------|
| admin  | ✅        | ✅                  | ✅                  | ✅               |
| user   | ✅        | ✅                  | ❌ (403)            | ❌ (403)         |

### Default admin

On first startup (empty database), auto-setup creates:
- **Username:** `admin`
- **Password:** `admin`
- **Role:** `admin`

> ⚠️ **Change the admin password immediately** after first login via the
> admin panel or API. This is a security risk in production.

## Admin Web Panel

A built-in admin dashboard is available at **http://localhost:8000/admin**.
No build step required — it's a single-page vanilla HTML/CSS/JS app served
directly by FastAPI.

### Features

- **🔐 Login** — Sign in with any registered user account (JWT stored in localStorage)
- **📊 Dashboard** — Overview of current user, quick actions, system info
- **👥 Users** — View all registered users in a table with view buttons
- **➕ Add User** — Register new users directly from the panel
- **🔌 API Explorer** — Try any API endpoint directly from the browser with
  pre-filled request bodies and live response display

### How to extend

To add a new section to the admin panel, edit `app/static/admin.html`:

1. Add a sidebar link: `<a href="#" data-page="myfeature" onclick="navigate('myfeature', this)">📦 My Feature</a>`
2. Add a render function in the `navigate()` switch:
   ```javascript
   else if (page === 'myfeature') c.innerHTML = renderMyFeature();
   ```
3. Write your `renderMyFeature()` function that calls the API and displays results.

The admin panel uses the same JWT-authenticated API endpoints — no separate
admin auth is needed. Any logged-in user can access the panel.

## Creating a new migration

```bash
# Linux
alembic revision -m "add posts table"
# edit alembic/versions/<new>.py with op.execute("CREATE TABLE ...")
alembic upgrade head
```

```powershell
# Windows
alembic revision -m "add posts table"
# edit alembic/versions\<new>.py with op.execute("CREATE TABLE ...")
alembic upgrade head
```

## Notes

- **psycopg3** is used directly (no SQLAlchemy ORM). All queries are raw SQL
  with parameterized placeholders (`%s`).
- The connection pool (`AsyncConnectionPool`) is initialized in the FastAPI
  lifespan and shared across requests.
- `gen_random_uuid()` requires the `pgcrypto` extension (enabled in step 3).
- JWT uses `PyJWT` (not `python-jose`) — lighter and actively maintained.

---

## Production Deployment

### Option A: One-Command Deploy (Linux Server)

```bash
# Clone the repo
git clone https://github.com/deepbhut-ai/pinggy.git
cd pinggy

# Run the deployment script (installs everything)
sudo bash deploy.sh xyz.com admin@xyz.com
```

This script:
1. Installs Python, PostgreSQL, nginx, certbot
2. Creates the `pinggy` database + user
3. Sets up the Python virtualenv + dependencies
4. Configures nginx with wildcard `*.xyz.com`
5. Obtains SSL certificate from Let's Encrypt (DNS challenge)
6. Creates a systemd service for auto-start on boot
7. Starts everything

After deployment:
```
Admin Panel:  https://xyz.com/admin
SSH Tunnel:   ssh -p 2222 -R0:localhost:PORT xyz.com
```

### Option B: Docker Compose

```bash
# 1. Configure .env
cp .env.example .env
# Edit: set TUNNEL_DOMAIN=xyz.com, POSTGRES_PASSWORD, JWT_SECRET

# 2. Get SSL certificate (wildcard requires DNS challenge)
sudo certbot certonly --manual --preferred-challenges dns \
    -d *.xyz.com -d xyz.com --email admin@xyz.com

# 3. Edit nginx/pinggy.conf — replace xyz.com with your domain

# 4. Start everything
docker compose up -d

# 5. Run migrations (first time only)
docker compose exec app alembic upgrade head
```

### Option C: Manual Setup

```bash
# 1. Install dependencies
sudo apt install python3 python3-venv postgresql nginx certbot

# 2. Set up the app
git clone https://github.com/deepbhut-ai/pinggy.git /opt/pinggy
cd /opt/pinggy
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 3. Configure
cp .env.example .env
# Edit .env: set TUNNEL_DOMAIN, POSTGRES_PASSWORD, JWT_SECRET

# 4. Set up nginx
sudo cp nginx/pinggy.conf /etc/nginx/sites-available/pinggy
sudo ln -s /etc/nginx/sites-available/pinggy /etc/nginx/sites-enabled/pinggy
# Edit the config to replace xyz.com with your domain

# 5. Get SSL certificate
sudo bash nginx/setup-ssl.sh xyz.com admin@xyz.com

# 6. Set up systemd service
sudo cp deploy/pinggy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pinggy
sudo systemctl start pinggy

# 7. Reload nginx
sudo nginx -t && sudo systemctl reload nginx
```

### Post-Deployment

1. **Change admin password:**
   - Login at `https://xyz.com/admin` with `admin` / `admin`
   - Create a new admin user, then delete or change the default

2. **Open firewall ports:**
   ```bash
   sudo ufw allow 80/tcp     # HTTP
   sudo ufw allow 443/tcp    # HTTPS
   sudo ufw allow 2222/tcp   # SSH tunnel port
   ```

3. **DNS setup:**
   - Point `xyz.com` A record to your server IP
   - Point `*.xyz.com` A record to your server IP (wildcard)

4. **Test the tunnel:**
   ```bash
   # On any machine:
   ssh -p 2222 -R0:localhost:3000 xyz.com
   # Server prints: https://k7m3x9a.xyz.com
   # Visit that URL — it routes to your localhost:3000
   ```

### Managing the Service

```bash
sudo systemctl status pinggy    # check status
sudo systemctl restart pinggy   # restart
sudo systemctl stop pinggy      # stop
journalctl -u pinggy -f         # view live logs
```

### SSL Certificate Renewal

Let's Encrypt certificates expire in 90 days. Auto-renewal is set up by the
deployment script. To manually renew:

```bash
sudo certbot renew --dry-run    # test
sudo certbot renew              # renew
sudo systemctl reload nginx     # apply
```
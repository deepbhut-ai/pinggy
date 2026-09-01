# Database Schema — Pinggy Tunnel Dashboard

## Tables

### `users`
Stores user accounts and authentication data.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique user identifier |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt hashed password |
| `full_name` | VARCHAR(120) | | User display name |
| `role` | VARCHAR(20) | DEFAULT 'user' | 'admin' or 'user' |
| `tunnel_token` | VARCHAR(255) | UNIQUE | Legacy tunnel authentication token |
| `plan` | VARCHAR(20) | DEFAULT 'free' | 'free' or 'pro' |
| `seats` | INT | DEFAULT 1 | Number of team seats (for pro plan) |
| `custom_domain` | VARCHAR(255) | | User's custom domain for tunnels |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Account creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last update timestamp |

**Indices:** email (UNIQUE), tunnel_token (UNIQUE)

---

### `tunnels`
Stores active and historical tunnel instances.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique tunnel identifier |
| `user_id` | UUID | FOREIGN KEY → users(id), NOT NULL | Tunnel owner |
| `subdomain` | VARCHAR(255) | NOT NULL | Requested subdomain (e.g., 'myapp') |
| `port` | INTEGER | NOT NULL | Local port being tunneled |
| `protocol` | VARCHAR(10) | DEFAULT 'http' | 'http', 'https', or 'tcp' |
| `status` | VARCHAR(20) | DEFAULT 'active' | 'active', 'paused', 'error' |
| `request_count` | INTEGER | DEFAULT 0 | Cumulative requests routed |
| `bytes_transferred` | BIGINT | DEFAULT 0 | Cumulative bytes transferred |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Tunnel creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last activity timestamp |

**Indices:** user_id, subdomain, status

---

### `tunnel_tokens` (deprecated)
Legacy token-based tunnel authentication (kept for backward compatibility).

---

### `tokens`
OAuth-style API tokens for programmatic access.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Token identifier |
| `user_id` | UUID | FOREIGN KEY → users(id), NOT NULL | Token owner |
| `name` | VARCHAR(120) | | Human-readable token name |
| `token_hash` | VARCHAR(255) | NOT NULL | Hashed token value |
| `custom_domain` | VARCHAR(255) | | Associated custom domain (if any) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last update time |

**Indices:** user_id, token_hash (UNIQUE)

---

### `payments`
Payment records for premium features.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Payment identifier |
| `user_id` | UUID | FOREIGN KEY → users(id), NOT NULL | Payer |
| `amount` | DECIMAL(10, 2) | NOT NULL | Payment amount |
| `currency` | VARCHAR(10) | DEFAULT 'INR' | ISO currency code |
| `status` | VARCHAR(20) | DEFAULT 'pending' | 'pending', 'paid', 'failed', 'expired' |
| `razorpay_order_id` | VARCHAR(255) | | Razorpay order ID |
| `razorpay_payment_id` | VARCHAR(255) | | Razorpay payment ID |
| `metadata` | JSONB | | Extra payment data |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last update time |

**Indices:** user_id, status, razorpay_payment_id

---

## Migrations

Alembic migrations are stored in `alembic/versions/`. Run `alembic upgrade head` to apply all migrations.

| Version | Description | Status |
|---------|-------------|--------|
| 0001 | Create users table | Applied |
| 0002 | Add role and default admin | Applied |
| 0003 | Create tunnels table | Applied |
| 0004 | Add tunnel_token column | Applied |
| 0005 | Add custom_domain column | Applied |
| 0006 | Create tokens table | Applied |
| 0007 | Add plan columns | Applied |
| 0008 | Add payments table | Applied |
| 0009 | Add seats column | Applied |

---

## Default Data

On first run, `auto_setup.py` creates:
- **Default Admin User**: email=`support@callingagents.in`, password=`Calling@2025_26`, role=`admin`
  - Generated tunnel_token for API access
  - Created only if no users exist in the database

---

## Access Patterns

- **User by email**: `SELECT * FROM users WHERE email = %s`
- **User's tunnels**: `SELECT * FROM tunnels WHERE user_id = %s ORDER BY created_at DESC`
- **Active tunnels**: `SELECT * FROM tunnels WHERE status = 'active'`
- **Tunnel by subdomain**: `SELECT * FROM tunnels WHERE subdomain = %s`

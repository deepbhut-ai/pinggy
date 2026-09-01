# Functions & API Endpoints — Pinggy Tunnel Dashboard

## Authentication (`app/api/routers/auth.py`)

### `POST /api/auth/login`
Login with email/username and password.

**Request:**
```json
{
  "username": "support@callingagents.in",
  "password": "Calling@2025_26"
}
```

**Response (success):**
```json
{
  "access_token": "eyJ0...",
  "token_type": "bearer"
}
```

**Response (failure):** 401 Unauthorized

**Side effects:** None; stateless JWT-based auth

---

### `POST /api/auth/register`
Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "full_name": "John Doe"
}
```

**Response (success):** 201 Created, returns access_token
**Response (failure):** 400 Bad Request (email exists, password too short)

**Side effects:** Creates new user, generates tunnel_token

---

## Tunnels (`app/api/routers/tunnels.py`)

### `POST /api/tunnels` (Create Tunnel)
Create a new tunnel for the authenticated user.

**Request:**
```json
{
  "subdomain": "myapp",
  "port": 3000,
  "protocol": "http"
}
```

**Response:** 201 Created
```json
{
  "id": "uuid",
  "subdomain": "myapp",
  "port": 3000,
  "protocol": "http",
  "status": "active",
  "ssh_command": "ssh -R myapp:80:localhost:3000 tunnel.iraglobaltech.com"
}
```

**Auth:** Requires JWT token
**Validation:** Subdomain must be unique; restricted domains (*.iraglobaltech.com) require admin role

---

### `GET /api/tunnels` (List User's Tunnels)
Get all tunnels for the authenticated user.

**Response:** 200 OK
```json
[
  {
    "id": "uuid",
    "subdomain": "myapp",
    "port": 3000,
    "protocol": "http",
    "status": "active",
    "request_count": 150,
    "bytes_transferred": 2048000,
    "created_at": "2026-09-01T12:00:00Z"
  }
]
```

**Auth:** Requires JWT token

---

### `GET /api/tunnels/active` (Admin Only)
List all active tunnels across all users.

**Response:** 200 OK (array of tunnels with user_id)

**Auth:** Requires admin role

---

### `DELETE /api/tunnels/{subdomain}` (Delete Tunnel)
Stop and remove a tunnel.

**Response:** 200 OK
```json
{
  "message": "Tunnel stopped and deleted",
  "subdomain": "myapp"
}
```

**Auth:** Requires JWT token (user owns tunnel) OR admin role

---

## Users (`app/api/routers/users.py`)

### `GET /api/users/{user_id}` (Admin Only)
Get user details.

**Response:** 200 OK
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "user",
  "plan": "free",
  "created_at": "2026-09-01T12:00:00Z"
}
```

**Auth:** Requires admin role

---

### `PUT /api/users/{user_id}` (Admin Only)
Update user profile or role.

**Request:**
```json
{
  "email": "newemail@example.com",
  "role": "pro",
  "full_name": "Jane Doe"
}
```

**Response:** 200 OK (updated user)

**Auth:** Requires admin role

---

### `DELETE /api/users/{user_id}` (Admin Only)
Delete a user and all associated tunnels.

**Response:** 200 OK

**Auth:** Requires admin role
**Side effects:** Cascades to delete tunnels, tokens, payments

---

## Admin (`app/api/routers/admin.py`)

### `GET /admin` (Admin Panel)
Serve the admin dashboard HTML.

**Response:** 200 OK (HTML page)

**Auth:** Optional; page has client-side JWT check

---

## Tokens (`app/api/routers/tokens.py`)

### `POST /api/tokens` (Create Token)
Generate an API token for programmatic access.

**Request:**
```json
{
  "name": "CI/CD Pipeline",
  "custom_domain": "ci.example.com"
}
```

**Response:** 201 Created
```json
{
  "id": "uuid",
  "name": "CI/CD Pipeline",
  "token": "tun_abc123xyz...",
  "created_at": "2026-09-01T12:00:00Z"
}
```

**Auth:** Requires JWT token
**Note:** Token is only returned once at creation; cannot be retrieved again

---

### `GET /api/tokens` (List Tokens)
List all API tokens for the authenticated user.

**Response:** 200 OK (array of tokens without token value)

**Auth:** Requires JWT token

---

### `DELETE /api/tokens/{token_id}` (Revoke Token)
Revoke an API token.

**Response:** 200 OK

**Auth:** Requires JWT token (user owns token) OR admin role

---

## Payments (`app/api/routers/payments.py`)

### `POST /api/payments/create-order` (Create Payment Order)
Create a Razorpay payment order for plan upgrade.

**Request:**
```json
{
  "plan": "pro",
  "amount": 99900
}
```

**Response:** 201 Created
```json
{
  "order_id": "order_...",
  "amount": 99900,
  "currency": "INR"
}
```

**Auth:** Requires JWT token

---

### `POST /api/payments/verify` (Verify Payment)
Verify Razorpay payment and upgrade user plan.

**Request:**
```json
{
  "razorpay_order_id": "order_...",
  "razorpay_payment_id": "pay_...",
  "razorpay_signature": "sig_..."
}
```

**Response:** 200 OK (payment verified and plan updated)

**Auth:** Requires JWT token

---

## Core Services (`app/core/`)

### `SSHServer` (ssh_server.py)
Handles inbound SSH connections on port 2222, routes to tunnels.

### `Proxy` (proxy.py)
HTTP reverse proxy that routes requests to registered tunnels.

### `TunnelRegistry` (tunnel_registry.py)
In-memory registry of active tunnels for quick lookup.

### `IPMonitor` (ip_monitor.py)
Tracks and blocks suspicious IPs making excessive requests.

---

## Utility Functions

### `bcrypt_hash(password: str) -> str` (security.py)
Hash a password using bcrypt.

### `verify_password(password: str, hash: str) -> bool` (security.py)
Verify a plain password against a bcrypt hash.

### `create_access_token(data: dict, expires_delta: timedelta) -> str` (security.py)
Generate a JWT access token.

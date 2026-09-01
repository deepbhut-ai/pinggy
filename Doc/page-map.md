# Page Map — Complete Routing & Data Connections

## Pages Table

| URL | Page Name | DB Tables (R/W) | Functions/Endpoints | Components | Auth | Links To | Linked From | Shares Data With |
|-----|-----------|-----------------|---------------------|------------|------|----------|-------------|------------------|
| `/` | Landing | none | none | Hero, Features, CTA buttons | None | /login, /dashboard | — | — |
| `/login` | Login Form | users (R) | POST /api/auth/login | Email input, Password input, Form | None | /dashboard (on success), /signup | Landing | Tunnel Registry |
| `/signup` | Sign Up Form | users (W) | POST /api/auth/register | Email input, Password input, Name input, Form | None | /login (on cancel), /dashboard (on success) | Login | — |
| `/dashboard` | User Dashboard | tunnels (R), users (R) | GET /api/tunnels, GET /api/me | Tunnel list, Active tunnels, Stats cards | JWT Required | /admin (if admin), /login (logout) | Login, Landing | tunnels table, users table |
| `/admin` | Admin Panel | users (R/W), tunnels (R), payments (R) | GET /api/users/*, PUT /api/users/*, GET /api/payments/admin/all | User table, Payment table, IP Monitor | Admin Only | /dashboard (back to user) | — | users table, tunnels table, payments table |

---

## Navigation Graph

```
Landing (/login → /login)
   ↓
Login → Signup (link back)
   ↓
Dashboard (POST /api/auth/login success)
   ↓ (if admin)
Admin Panel
```

---

## Data-Flow Graph

| Source | Action | Target | Connection |
|--------|--------|--------|------------|
| Dashboard | User creates tunnel | Dashboard, Tunnel Registry | Shared `tunnels` table; new tunnel appears in list after polling |
| Dashboard | User deletes tunnel | Dashboard | Shared `tunnels` table; tunnel removed from list after polling |
| Admin Panel | Admin updates user plan | Dashboard | Shared `users` table; user's plan shown on Dashboard after login refresh |
| Admin Panel | Admin disables user | Dashboard | Shared `users` table; user logged out on next auth check |
| Login | Auth success | Dashboard | JWT token stored in localStorage; Dashboard checks token validity |

---

## Polling & Real-Time Updates

- **Dashboard polls `/api/tunnels` every 5 seconds** to refresh tunnel list and stats (request_count, bytes_transferred)
- **Admin Panel polls `/api/users`, `/api/payments/admin/all` on tab focus**

---

## Orphan Check

- **Landing page** has no inbound links except external referrals; serves as entry point only
- **Signup page** only accessed from Login; no direct external path
- All other pages have inbound links ✓

---

## Blocked IPs & Session State

- **IP Monitor** (not a page) blocks malicious IPs; affects all pages indirectly
- **Redis cache** stores session tokens and rate-limit buckets; shared across all endpoints

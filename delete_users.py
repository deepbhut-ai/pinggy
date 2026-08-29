#!/usr/bin/env python3
"""Delete users and all their related data."""
import psycopg

EMAILS = [
    "support@@iraglobaltech.com",
]

conn = psycopg.connect("host=localhost dbname=pinggy user=postgres password=root")
cur = conn.cursor()

# Show users before deletion
print("=== Users to delete ===")
cur.execute("SELECT id, email, role, plan FROM users WHERE email = ANY(%s)", (EMAILS,))
users = cur.fetchall()
for u in users:
    print(f"  ID: {u[0]} | Email: {u[1]} | Role: {u[2]} | Plan: {u[3]}")

if not users:
    print("  No matching users found.")
    cur.close()
    conn.close()
    exit(0)

# Show related data counts
for email in EMAILS:
    cur.execute("SELECT COUNT(*) FROM tokens WHERE user_email = %s", (email,))
    token_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM tunnels WHERE user_email = %s", (email,))
    tunnel_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM payments WHERE user_email = %s", (email,))
    payment_count = cur.fetchone()[0]
    print(f"  {email}: {token_count} tokens, {tunnel_count} tunnels, {payment_count} payments")

# Delete related data first, then users
print("\n=== Deleting ===")
for email in EMAILS:
    cur.execute("DELETE FROM tokens WHERE user_email = %s", (email,))
    print(f"  Deleted {cur.rowcount} tokens for {email}")
    cur.execute("DELETE FROM tunnels WHERE user_email = %s", (email,))
    print(f"  Deleted {cur.rowcount} tunnels for {email}")
    cur.execute("DELETE FROM payments WHERE user_email = %s", (email,))
    print(f"  Deleted {cur.rowcount} payments for {email}")
    cur.execute("DELETE FROM users WHERE email = %s", (email,))
    print(f"  Deleted {cur.rowcount} user for {email}")

conn.commit()

# Verify
print("\n=== Remaining users ===")
cur.execute("SELECT id, email, role, plan FROM users ORDER BY created_at")
for u in cur.fetchall():
    print(f"  ID: {u[0]} | Email: {u[1]} | Role: {u[2]} | Plan: {u[3]}")

cur.close()
conn.close()
print("\nDone!")
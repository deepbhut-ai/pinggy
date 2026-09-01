# Session Notes — Pinggy Dashboard

## 2026-09-01 — Admin Credentials Update & Project Documentation

### Done
- **v0.1.1**: Updated default admin credentials to `support@callingagents.in` / `Calling@2025_26`
  - Modified `app/core/auto_setup.py` to create admin with new credentials on startup
  - Created comprehensive Doc/ structure: CHANGELOG.md, process-flow.md, database.md, functions.md, page-map.md, pages.md
  - Committed and tagged as v0.1.1

### In Progress / Next
- **Testing note**: The new default credentials will only be created on app startup if the `users` table is empty. Since the database already contains users, the auto_setup will skip creation. To test:
  1. Reset the database (truncate/drop users table), OR
  2. Manually insert the user via SQL: 
     ```sql
     INSERT INTO users (email, password_hash, full_name, role, tunnel_token)
     VALUES ('support@callingagents.in', <bcrypt_hash_of_Calling@2025_26>, 'Calling Agents Admin', 'admin', <token>);
     ```
  3. Restart the app to trigger auto_setup with empty users table

### Watch Out
- Auto_setup only creates default admin if users table is empty — this is a safety feature to prevent overwriting existing admins
- Code change is complete; just needs either DB reset or manual user creation to verify

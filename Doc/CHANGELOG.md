# Changelog — Pinggy Tunnel Dashboard

All notable changes to this project will be documented in this file.

## [v0.1.0] — 2026-09-01

### Added
- Initial project documentation structure (Doc/ with process-flow, database, functions, page-map)
- Default admin user credentials set to: `support@callingagents.in` / `Calling@2025_26`

### Changed
- Auto-setup now creates admin user with custom credentials instead of hardcoded `admin/admin`
- `app/core/auto_setup.py` updated to use configurable default admin email and password

### Removed
- Hardcoded default credentials (old `admin/admin` pattern removed from initialization)

---

## Legend
- **Added:** New features, files, or pages introduced
- **Changed:** Existing code, behavior, or configuration modified
- **Removed:** Deleted code, files, routes, or configuration (always include reason)

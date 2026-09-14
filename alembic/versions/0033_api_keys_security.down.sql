-- Down migration for 0033 — api_keys security
-- Re-add key_plain, drop is_active

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_plain VARCHAR(255) NULL;
DROP INDEX IF EXISTS idx_api_keys_active;
ALTER TABLE api_keys DROP COLUMN IF EXISTS is_active;
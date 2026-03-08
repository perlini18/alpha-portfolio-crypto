CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NULL,
  image TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
ON users (LOWER(email));

ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE entitlements
ADD COLUMN IF NOT EXISTS user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions(user_id);
CREATE INDEX IF NOT EXISTS entitlements_user_id_idx ON entitlements(user_id);

DROP INDEX IF EXISTS accounts_one_default;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_default
ON accounts (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
WHERE is_default = TRUE;

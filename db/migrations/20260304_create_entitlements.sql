CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'workspace')),
  owner_id TEXT NOT NULL,
  key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'expired')),
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'crypto', 'manual')),
  provider_customer_id TEXT NULL,
  provider_subscription_id TEXT NULL,
  current_period_end TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_type, owner_id, key)
);

CREATE INDEX IF NOT EXISTS entitlements_lookup_idx
ON entitlements (owner_type, owner_id, key, status, current_period_end DESC);

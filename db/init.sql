CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
ON users (LOWER(email));

CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'exchange' CHECK (kind IN ('exchange','fiat')),
  base_currency TEXT DEFAULT 'USD',
  notes TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE assets (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('crypto','stock')) NOT NULL,
  asset_class TEXT NOT NULL DEFAULT 'crypto' CHECK (asset_class IN ('crypto', 'stock')),
  provider TEXT DEFAULT 'coingecko',
  provider_id TEXT NULL,
  coingecko_id TEXT NULL,
  coingecko_symbol TEXT NULL,
  last_price DOUBLE PRECISION DEFAULT 0,
  last_price_updated_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  datetime TIMESTAMP NOT NULL,
  type TEXT CHECK (type IN ('BUY','SELL','DEPOSIT','WITHDRAW','FEE')) NOT NULL,
  account_id INT REFERENCES accounts(id) ON DELETE CASCADE,
  asset_symbol TEXT REFERENCES assets(symbol) ON DELETE RESTRICT,
  quote_asset_symbol TEXT REFERENCES assets(symbol) ON DELETE RESTRICT,
  quantity DOUBLE PRECISION NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  gross_proceeds DOUBLE PRECISION,
  net_proceeds DOUBLE PRECISION,
  fee_amount DOUBLE PRECISION DEFAULT 0,
  fee_currency TEXT,
  notes TEXT
);

CREATE TABLE ads (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NULL,
  image_url TEXT NULL,
  cta_text TEXT NOT NULL,
  target_url TEXT NOT NULL,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  weight INT NOT NULL DEFAULT 1,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ad_events (
  id SERIAL PRIMARY KEY,
  ad_id INT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  page TEXT NOT NULL CHECK (page IN ('dashboard', 'portfolio', 'accounts', 'transactions')),
  user_id TEXT NULL,
  anonymous_session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS ad_events_rate_idx
ON ad_events (ad_id, event_type, page, anonymous_session_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_default_account_per_user
ON accounts (user_id)
WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS entitlements_lookup_idx
ON entitlements (owner_type, owner_id, key, status, current_period_end DESC);

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions(user_id);
CREATE INDEX IF NOT EXISTS entitlements_user_id_idx ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_asset ON transactions(user_id, asset_symbol);
CREATE INDEX IF NOT EXISTS idx_tx_user_account ON transactions(user_id, account_id);

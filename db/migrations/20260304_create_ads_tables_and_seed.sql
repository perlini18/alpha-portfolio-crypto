CREATE TABLE IF NOT EXISTS ads (
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

CREATE TABLE IF NOT EXISTS ad_events (
  id SERIAL PRIMARY KEY,
  ad_id INT NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  page TEXT NOT NULL CHECK (page IN ('dashboard', 'portfolio', 'accounts', 'transactions')),
  user_id TEXT NULL,
  anonymous_session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ad_events_rate_idx
ON ad_events (ad_id, event_type, page, anonymous_session_id, created_at DESC);

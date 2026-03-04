ALTER TABLE assets ADD COLUMN IF NOT EXISTS coingecko_id TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS coingecko_symbol TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'coingecko';

UPDATE assets
SET coingecko_id = provider_id
WHERE (coingecko_id IS NULL OR coingecko_id = '')
  AND provider_id IS NOT NULL
  AND provider_id <> '';

UPDATE assets
SET coingecko_symbol = LOWER(symbol)
WHERE coingecko_id IS NOT NULL
  AND coingecko_id <> ''
  AND (coingecko_symbol IS NULL OR coingecko_symbol = '');

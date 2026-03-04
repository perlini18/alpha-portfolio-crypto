ALTER TABLE assets
ADD COLUMN IF NOT EXISTS provider_id TEXT NULL;

UPDATE assets
SET provider_id = 'bitcoin'
WHERE UPPER(symbol) = 'BTC'
  AND (provider_id IS NULL OR provider_id = '');

UPDATE assets
SET provider_id = 'ethereum'
WHERE UPPER(symbol) = 'ETH'
  AND (provider_id IS NULL OR provider_id = '');

UPDATE assets
SET provider_id = 'solana'
WHERE UPPER(symbol) = 'SOL'
  AND (provider_id IS NULL OR provider_id = '');

UPDATE assets
SET provider_id = 'binancecoin'
WHERE UPPER(symbol) = 'BNB'
  AND (provider_id IS NULL OR provider_id = '');

UPDATE assets
SET provider_id = 'cardano'
WHERE UPPER(symbol) = 'ADA'
  AND (provider_id IS NULL OR provider_id = '');

UPDATE assets
SET provider_id = 'ripple'
WHERE UPPER(symbol) = 'XRP'
  AND (provider_id IS NULL OR provider_id = '');

UPDATE assets
SET provider_id = 'dogecoin'
WHERE UPPER(symbol) = 'DOGE'
  AND (provider_id IS NULL OR provider_id = '');

UPDATE assets
SET provider_id = 'polkadot'
WHERE UPPER(symbol) = 'DOT'
  AND (provider_id IS NULL OR provider_id = '');

UPDATE assets
SET provider_id = 'polygon'
WHERE UPPER(symbol) = 'MATIC'
  AND (provider_id IS NULL OR provider_id = '');

UPDATE assets
SET provider_id = 'chainlink'
WHERE UPPER(symbol) = 'LINK'
  AND (provider_id IS NULL OR provider_id = '');

UPDATE assets
SET provider_id = 'oasis-network'
WHERE UPPER(symbol) = 'ROSE'
  AND (provider_id IS NULL OR provider_id = '');

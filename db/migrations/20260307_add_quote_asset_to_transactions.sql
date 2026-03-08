ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS quote_asset_symbol TEXT NULL REFERENCES assets(symbol);

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS gross_proceeds DOUBLE PRECISION NULL;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS net_proceeds DOUBLE PRECISION NULL;

UPDATE transactions
SET quote_asset_symbol = 'USD'
WHERE quote_asset_symbol IS NULL
  AND type IN ('BUY', 'SELL');

UPDATE transactions
SET gross_proceeds = quantity * price
WHERE gross_proceeds IS NULL
  AND type IN ('BUY', 'SELL');

UPDATE transactions
SET net_proceeds = quantity * price
WHERE net_proceeds IS NULL
  AND type IN ('BUY', 'SELL');

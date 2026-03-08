ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS quote_asset_symbol TEXT,
  ADD COLUMN IF NOT EXISTS gross_proceeds DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS net_proceeds DOUBLE PRECISION;

UPDATE transactions
SET quote_asset_symbol = 'USD'
WHERE type IN ('BUY', 'SELL')
  AND quote_asset_symbol IS NULL;

UPDATE transactions
SET gross_proceeds = quantity * price
WHERE type IN ('BUY', 'SELL')
  AND gross_proceeds IS NULL;

UPDATE transactions
SET net_proceeds = CASE
  WHEN type = 'SELL' THEN CASE
    WHEN UPPER(COALESCE(fee_currency, '')) = UPPER(COALESCE(quote_asset_symbol, ''))
      THEN (quantity * price) - COALESCE(fee_amount, 0)
    ELSE quantity * price
  END
  WHEN type = 'BUY' THEN CASE
    WHEN UPPER(COALESCE(fee_currency, '')) = UPPER(COALESCE(quote_asset_symbol, ''))
      THEN (quantity * price) + COALESCE(fee_amount, 0)
    ELSE quantity * price
  END
  ELSE net_proceeds
END
WHERE type IN ('BUY', 'SELL')
  AND net_proceeds IS NULL;

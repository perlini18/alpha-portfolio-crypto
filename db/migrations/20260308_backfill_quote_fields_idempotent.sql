-- Backfill trading pair proceeds fields for legacy BUY/SELL rows.
-- Idempotent: only updates missing/blank values.

UPDATE transactions
SET quote_asset_symbol = 'USD'
WHERE type IN ('BUY', 'SELL')
  AND (quote_asset_symbol IS NULL OR BTRIM(quote_asset_symbol) = '');

UPDATE transactions
SET gross_proceeds = quantity * price
WHERE type IN ('BUY', 'SELL')
  AND gross_proceeds IS NULL;

UPDATE transactions
SET net_proceeds = CASE
  WHEN type = 'BUY' THEN CASE
    WHEN UPPER(COALESCE(fee_currency, '')) = UPPER(COALESCE(quote_asset_symbol, ''))
      THEN (quantity * price) + COALESCE(fee_amount, 0)
    ELSE quantity * price
  END
  WHEN type = 'SELL' THEN CASE
    WHEN UPPER(COALESCE(fee_currency, '')) = UPPER(COALESCE(quote_asset_symbol, ''))
      THEN GREATEST(0, (quantity * price) - COALESCE(fee_amount, 0))
    ELSE quantity * price
  END
  ELSE net_proceeds
END
WHERE type IN ('BUY', 'SELL')
  AND net_proceeds IS NULL;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS kind TEXT;

ALTER TABLE accounts
  ALTER COLUMN kind DROP DEFAULT;

UPDATE accounts
SET kind = CASE
  WHEN kind = 'FIAT_CASH' THEN 'fiat'
  WHEN kind IN ('exchange', 'fiat') THEN kind
  ELSE 'exchange'
END;

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_kind_check;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_kind_check
  CHECK (kind IN ('exchange', 'fiat'));

ALTER TABLE accounts
  ALTER COLUMN kind SET DEFAULT 'exchange';

UPDATE accounts
SET kind='fiat'
WHERE base_currency='MXN' AND name ILIKE '%fiat%';

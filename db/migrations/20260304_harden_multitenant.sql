CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  first_user_id UUID;
BEGIN
  SELECT id INTO first_user_id
  FROM users
  ORDER BY created_at ASC
  LIMIT 1;

  IF first_user_id IS NOT NULL THEN
    UPDATE accounts SET user_id = first_user_id WHERE user_id IS NULL;
    UPDATE transactions SET user_id = first_user_id WHERE user_id IS NULL;
  END IF;
END $$;

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE user_id IS NULL) THEN
    ALTER TABLE accounts ALTER COLUMN user_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'accounts.user_id still contains NULL values; NOT NULL skipped';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM transactions WHERE user_id IS NULL) THEN
    ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'transactions.user_id still contains NULL values; NOT NULL skipped';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_asset ON transactions(user_id, asset_symbol);
CREATE INDEX IF NOT EXISTS idx_tx_user_account ON transactions(user_id, account_id);

DROP INDEX IF EXISTS accounts_one_default;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_default_account_per_user
ON accounts(user_id)
WHERE is_default = true;

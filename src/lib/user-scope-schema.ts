import { pool } from "@/lib/db";

let ensurePromise: Promise<void> | null = null;

async function hasColumn(table: "accounts" | "transactions", column: "user_id") {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS exists`,
    [table, column]
  );
  return Boolean(rows[0]?.exists);
}

export async function ensureUserScopeSchema(userId: string) {
  if (ensurePromise) {
    return ensurePromise;
  }

  ensurePromise = (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
      await client.query(
        `CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT NOT NULL,
          name TEXT NULL,
          image TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
         ON users (LOWER(email))`
      );

      const accountsHasUserId = await hasColumn("accounts", "user_id");
      const txHasUserId = await hasColumn("transactions", "user_id");

      if (!accountsHasUserId) {
        await client.query("ALTER TABLE accounts ADD COLUMN user_id UUID");
      }
      if (!txHasUserId) {
        await client.query("ALTER TABLE transactions ADD COLUMN user_id UUID");
      }

      await client.query("UPDATE accounts SET user_id = $1 WHERE user_id IS NULL", [userId]);
      await client.query("UPDATE transactions SET user_id = $1 WHERE user_id IS NULL", [userId]);

      await client.query("ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_id_fkey");
      await client.query("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey");

      await client.query(
        `ALTER TABLE accounts
         ADD CONSTRAINT accounts_user_id_fkey
         FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
      );
      await client.query(
        `ALTER TABLE transactions
         ADD CONSTRAINT transactions_user_id_fkey
         FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
      );

      await client.query("ALTER TABLE accounts ALTER COLUMN user_id SET NOT NULL");
      await client.query("ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL");

      await client.query("CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_tx_user_id ON transactions(user_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_tx_user_asset ON transactions(user_id, asset_symbol)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_tx_user_account ON transactions(user_id, account_id)");

      await client.query("DROP INDEX IF EXISTS accounts_one_default");
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uniq_default_account_per_user
         ON accounts(user_id)
         WHERE is_default = true`
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })().finally(() => {
    ensurePromise = null;
  });

  return ensurePromise;
}

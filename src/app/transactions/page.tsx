import { pool } from "@/lib/db";
import { TransactionsView } from "@/components/TransactionsView";

export default async function TransactionsPage() {
  const txRes = await pool.query(
    `SELECT id, datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes
     FROM transactions
     ORDER BY datetime DESC, id DESC`
  );

  let accountsRes;
  try {
    accountsRes = await pool.query(
      "SELECT id, name, kind, is_default FROM accounts ORDER BY is_default DESC, name ASC"
    );
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") {
      throw error;
    }

    accountsRes = await pool.query(
      "SELECT id, name, 'CRYPTO_EXCHANGE'::text AS kind, false AS is_default FROM accounts ORDER BY name ASC"
    );
  }
  let assetsRes;
  try {
    assetsRes = await pool.query(
      "SELECT symbol, name, type, provider_id, coingecko_id, coingecko_symbol, last_price, updated_at, last_price_updated_at FROM assets ORDER BY symbol ASC"
    );
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") {
      throw error;
    }
    assetsRes = await pool.query(
      "SELECT symbol, name, type, provider_id, last_price, updated_at FROM assets ORDER BY symbol ASC"
    );
  }

  return <TransactionsView transactions={txRes.rows} accounts={accountsRes.rows} assets={assetsRes.rows} />;
}

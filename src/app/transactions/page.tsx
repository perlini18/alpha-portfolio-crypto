import { pool } from "@/lib/db";
import { TransactionsView } from "@/components/TransactionsView";
import { decryptText } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/current-user";

export default async function TransactionsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return <TransactionsView transactions={[]} accounts={[]} assets={[]} />;
  }

  let txRes;
  try {
    txRes = await pool.query(
      `SELECT id, datetime, type, account_id, asset_symbol, quote_asset_symbol, quantity, price, gross_proceeds, net_proceeds, fee_amount, fee_currency, notes
       FROM transactions
       WHERE user_id = $1
       ORDER BY datetime DESC, id DESC`,
      [user.id]
    );
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") {
      throw error;
    }
    txRes = await pool.query(
      `SELECT
         id,
         datetime,
         type,
         account_id,
         asset_symbol,
         NULL::text AS quote_asset_symbol,
         quantity,
         price,
         NULL::double precision AS gross_proceeds,
         NULL::double precision AS net_proceeds,
         fee_amount,
         fee_currency,
         notes
       FROM transactions
       WHERE user_id = $1
       ORDER BY datetime DESC, id DESC`,
      [user.id]
    );
  }

  let accountsRes;
  try {
    accountsRes = await pool.query(
      "SELECT id, name, kind, is_default, base_currency FROM accounts WHERE user_id = $1 ORDER BY is_default DESC, name ASC",
      [user.id]
    );
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") {
      throw error;
    }

    try {
      accountsRes = await pool.query(
        "SELECT id, name, 'CRYPTO_EXCHANGE'::text AS kind, false AS is_default, base_currency FROM accounts WHERE user_id = $1 ORDER BY name ASC",
        [user.id]
      );
    } catch (legacyError) {
      if ((legacyError as { code?: string }).code !== "42703") {
        throw legacyError;
      }
      throw legacyError;
    }
  }
  let assetsRes;
  try {
    assetsRes = await pool.query(
      "SELECT symbol, name, type, COALESCE(asset_class, type, 'crypto') AS asset_class, provider_id, coingecko_id, coingecko_symbol, last_price, updated_at, last_price_updated_at FROM assets ORDER BY symbol ASC"
    );
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") {
      throw error;
    }
    assetsRes = await pool.query(
      "SELECT symbol, name, type, provider_id, last_price, updated_at FROM assets ORDER BY symbol ASC"
    );
  }

  return (
    <TransactionsView
      transactions={txRes.rows.map((row) => ({
        ...row,
        notes: decryptText(row.notes)
      }))}
      accounts={accountsRes.rows}
      assets={assetsRes.rows}
    />
  );
}

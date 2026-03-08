import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

interface TxWithFee {
  id: number;
  datetime: string;
  account_id: number;
  user_id?: string | null;
  asset_symbol: string;
  fee_amount: number;
  fee_currency: string | null;
}

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const client = await pool.connect();
  let migrated = 0;

  try {
    await client.query("BEGIN");

    let candidates;
    try {
      candidates = await client.query<TxWithFee>(
        `SELECT id, datetime, account_id, user_id, asset_symbol, fee_amount, fee_currency
         FROM transactions
         WHERE type <> 'FEE'
           AND COALESCE(fee_amount, 0) > 0
         ORDER BY datetime ASC, id ASC`
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "42703") {
        throw error;
      }
      candidates = await client.query<TxWithFee>(
        `SELECT id, datetime, account_id, asset_symbol, fee_amount, fee_currency
         FROM transactions
         WHERE type <> 'FEE'
           AND COALESCE(fee_amount, 0) > 0
         ORDER BY datetime ASC, id ASC`
      );
    }

    for (const tx of candidates.rows) {
      const expectedNote = `Fee for tx ${tx.id}`;
      const existingFee = await client.query(
        `SELECT id
         FROM transactions
         WHERE type = 'FEE'
           AND notes = $1
         LIMIT 1`,
        [expectedNote]
      );

      if (existingFee.rows[0]) {
        continue;
      }

      const feeSymbol = String(tx.fee_currency || tx.asset_symbol).toUpperCase();
      if (tx.user_id) {
        await client.query(
          `INSERT INTO transactions (
             datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes, user_id
           )
           VALUES ($1, 'FEE', $2, $3, $4, 0, 0, NULL, $5, $6)`,
          [tx.datetime, tx.account_id, feeSymbol, Number(tx.fee_amount || 0), expectedNote, tx.user_id]
        );
      } else {
        await client.query(
          `INSERT INTO transactions (
             datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes
           )
           VALUES ($1, 'FEE', $2, $3, $4, 0, 0, NULL, $5)`,
          [tx.datetime, tx.account_id, feeSymbol, Number(tx.fee_amount || 0), expectedNote]
        );
      }
      migrated += 1;
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, migrated });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[api/dev/migrate-fees][POST] error", error);
    return NextResponse.json({ error: "Failed to migrate fees" }, { status: 500 });
  } finally {
    client.release();
  }
}

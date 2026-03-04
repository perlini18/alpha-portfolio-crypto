import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

interface TxWithFee {
  id: number;
  datetime: string;
  account_id: number;
  asset_symbol: string;
  fee_amount: number;
  fee_currency: string | null;
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const client = await pool.connect();
  let migrated = 0;

  try {
    await client.query("BEGIN");

    const candidates = await client.query<TxWithFee>(
      `SELECT id, datetime, account_id, asset_symbol, fee_amount, fee_currency
       FROM transactions
       WHERE type <> 'FEE'
         AND COALESCE(fee_amount, 0) > 0
       ORDER BY datetime ASC, id ASC`
    );

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
      await client.query(
        `INSERT INTO transactions (
           datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes
         )
         VALUES ($1, 'FEE', $2, $3, $4, 0, 0, NULL, $5)`,
        [tx.datetime, tx.account_id, feeSymbol, Number(tx.fee_amount || 0), expectedNote]
      );
      migrated += 1;
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, migrated });
  } catch (error) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: "Failed to migrate fees", details: String(error) }, { status: 500 });
  } finally {
    client.release();
  }
}

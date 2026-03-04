import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { createTransactionSchema } from "@/lib/schemas";

function revalidatePortfolioViews() {
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/assets");
  revalidatePath("/portfolio");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const assetSymbol = searchParams.get("assetSymbol");
  const accountId = searchParams.get("accountId");

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (assetSymbol) {
    values.push(assetSymbol.toUpperCase());
    conditions.push(`asset_symbol = $${values.length}`);
  }

  if (accountId) {
    values.push(Number(accountId));
    conditions.push(`account_id = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT id, datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes
     FROM transactions
     ${whereClause}
     ORDER BY datetime DESC, id DESC`,
    values
  );

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const client = await pool.connect();
  let inTransaction = false;

  try {
    const payload = await request.json();
    const normalizedPayload = {
      datetime: payload.datetime,
      type: payload.type,
      account_id: payload.account_id ?? payload.accountId,
      asset_symbol: payload.asset_symbol ?? payload.assetSymbol,
      quantity: payload.quantity,
      price: payload.price,
      fee_amount: payload.fee_amount ?? payload.feeAmount ?? 0,
      fee_currency: payload.fee_currency ?? payload.feeCurrency ?? null,
      notes: payload.notes ?? null
    };

    const parsed = createTransactionSchema.parse(normalizedPayload);

    await client.query("BEGIN");
    inTransaction = true;

    const mainInsert = await client.query(
      `INSERT INTO transactions (
         datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        parsed.datetime,
        parsed.type,
        parsed.account_id,
        parsed.asset_symbol,
        parsed.quantity,
        parsed.price,
        parsed.fee_amount,
        parsed.fee_currency ?? null,
        parsed.notes ?? null
      ]
    );
    const transactionId = Number(mainInsert.rows[0]?.id || 0);
    if (!transactionId) {
      throw new Error("Failed to insert transaction");
    }

    let feeTransactionId: number | null = null;
    if (parsed.type !== "FEE" && Number(parsed.fee_amount || 0) > 0) {
      const feeSymbol = String(parsed.fee_currency || parsed.asset_symbol).toUpperCase();
      const feeInsert = await client.query(
        `INSERT INTO transactions (
           datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes
         )
         VALUES ($1, 'FEE', $2, $3, $4, 0, 0, NULL, $5)
         RETURNING id`,
        [
          parsed.datetime,
          parsed.account_id,
          feeSymbol,
          parsed.fee_amount,
          `Fee for tx ${transactionId}`
        ]
      );
      feeTransactionId = Number(feeInsert.rows[0]?.id || 0) || null;
    }

    await client.query("COMMIT");
    inTransaction = false;

    revalidatePortfolioViews();
    return NextResponse.json(
      {
        transactionId,
        ...(feeTransactionId ? { feeTransactionId } : {})
      },
      { status: 201 }
    );
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    return NextResponse.json(
      { error: "Invalid transaction payload", details: String(error) },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

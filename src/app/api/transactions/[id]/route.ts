import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { updateTransactionSchema } from "@/lib/schemas";

interface Params {
  params: { id: string };
}

function parseTransactionId(rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

function revalidatePortfolioViews() {
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/assets");
  revalidatePath("/portfolio");
}

export async function PATCH(request: Request, { params }: Params) {
  const id = parseTransactionId(params.id);
  if (!id) {
    return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });
  }

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

    const parsed = updateTransactionSchema.parse(normalizedPayload);

    const { rows } = await pool.query(
      `UPDATE transactions
       SET
         datetime = $2,
         type = $3,
         account_id = $4,
         asset_symbol = $5,
         quantity = $6,
         price = $7,
         fee_amount = $8,
         fee_currency = $9,
         notes = $10
       WHERE id = $1
       RETURNING id, datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes`,
      [
        id,
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

    if (!rows[0]) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    revalidatePortfolioViews();
    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid transaction payload", details: String(error) },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const id = parseTransactionId(params.id);
  if (!id) {
    return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });
  }

  const { rowCount } = await pool.query("DELETE FROM transactions WHERE id = $1", [id]);

  if (!rowCount) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  revalidatePortfolioViews();
  return NextResponse.json({ ok: true });
}

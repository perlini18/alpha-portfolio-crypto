import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { decryptText, encryptText } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { updateTransactionSchema } from "@/lib/schemas";
import { getClientIp } from "@/lib/security";
import { computeTransactionPreview } from "@/lib/transaction-math";
import { requireUserId, UnauthorizedError } from "@/lib/requireUser";

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

async function ensureAssetExists(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return;
  await client.query(
    `INSERT INTO assets (symbol, name, type, last_price)
     VALUES ($1, $1, 'crypto', 0)
     ON CONFLICT (symbol) DO NOTHING`,
    [normalized]
  );
}

export async function PATCH(request: Request, { params }: Params) {
  const ip = getClientIp(request);
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = checkRateLimit({ key: `transactions:patch:${userId}:${ip}`, limit: 80, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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
      quote_asset_symbol: payload.quote_asset_symbol ?? payload.quoteAssetSymbol ?? null,
      quantity: payload.quantity,
      price: payload.price,
      gross_proceeds: payload.gross_proceeds ?? payload.grossProceeds ?? null,
      net_proceeds: payload.net_proceeds ?? payload.netProceeds ?? null,
      fee_amount: payload.fee_amount ?? payload.feeAmount ?? 0,
      fee_currency: payload.fee_currency ?? payload.feeCurrency ?? null,
      notes: payload.notes ?? null
    };

    const parsed = updateTransactionSchema.parse(normalizedPayload);
    const quoteAssetSymbol = (parsed.quote_asset_symbol || "USD").toUpperCase();
    const preview = computeTransactionPreview({
      type: parsed.type,
      assetSymbol: parsed.asset_symbol,
      quoteAssetSymbol,
      quantity: parsed.quantity,
      price: parsed.price,
      feeAmount: parsed.fee_amount,
      feeCurrency: parsed.fee_currency,
      baseCurrency: quoteAssetSymbol
    });

    await ensureAssetExists(pool, parsed.asset_symbol);
    await ensureAssetExists(pool, quoteAssetSymbol);

    const accountOwnership = await pool.query(
      "SELECT id FROM accounts WHERE id = $1 AND user_id = $2",
      [parsed.account_id, userId]
    );
    if (!accountOwnership.rows[0]) {
      return NextResponse.json({ error: "account not owned" }, { status: 403 });
    }

    let rows;
    try {
      const result = await pool.query(
        `UPDATE transactions
         SET
           datetime = $3,
           type = $4,
           account_id = $5,
           asset_symbol = $6,
           quote_asset_symbol = $7,
           quantity = $8,
           price = $9,
           gross_proceeds = $10,
           net_proceeds = $11,
           fee_amount = $12,
           fee_currency = $13,
           notes = $14
         WHERE id = $1
           AND user_id = $2
         RETURNING id, datetime, type, account_id, asset_symbol, quote_asset_symbol, quantity, price, gross_proceeds, net_proceeds, fee_amount, fee_currency, notes`,
        [
          id,
          userId,
          parsed.datetime,
          parsed.type,
          parsed.account_id,
          parsed.asset_symbol,
          quoteAssetSymbol,
          parsed.quantity,
          parsed.price,
          preview.grossProceeds,
          preview.netProceeds,
          parsed.fee_amount,
          parsed.fee_currency ?? null,
          encryptText(parsed.notes ?? null)
        ]
      );
      rows = result.rows;
    } catch (error) {
      if ((error as { code?: string }).code !== "42703") {
        throw error;
      }
      const result = await pool.query(
        `UPDATE transactions
         SET
           datetime = $3,
           type = $4,
           account_id = $5,
           asset_symbol = $6,
           quantity = $7,
           price = $8,
           fee_amount = $9,
           fee_currency = $10,
           notes = $11
         WHERE id = $1
           AND user_id = $2
         RETURNING
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
           notes`,
        [
          id,
          userId,
          parsed.datetime,
          parsed.type,
          parsed.account_id,
          parsed.asset_symbol,
          parsed.quantity,
          parsed.price,
          parsed.fee_amount,
          parsed.fee_currency ?? null,
          encryptText(parsed.notes ?? null)
        ]
      );
      rows = result.rows;
    }

    if (!rows[0]) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    revalidatePortfolioViews();
    return NextResponse.json({ ...rows[0], notes: decryptText(rows[0].notes) });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid transaction payload" },
        { status: 400 }
      );
    }
    console.error("[api/transactions/:id][PATCH] error", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const ip = getClientIp(request);
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = checkRateLimit({ key: `transactions:delete:${userId}:${ip}`, limit: 40, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const id = parseTransactionId(params.id);
  if (!id) {
    return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });
  }

  const { rowCount } = await pool.query(
    "DELETE FROM transactions WHERE id = $1 AND user_id = $2",
    [id, userId]
  );

  if (!rowCount) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  revalidatePortfolioViews();
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { decryptText, encryptText } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { createTransactionSchema } from "@/lib/schemas";
import { getClientIp } from "@/lib/security";
import { computeTransactionPreview } from "@/lib/transaction-math";
import { computeHoldingDelta } from "@/lib/transaction-math";
import { requireUserId, UnauthorizedError } from "@/lib/requireUser";

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

interface BalanceTxRow {
  type: string;
  quantity: number;
  fee_amount: number;
  fee_currency: string | null;
  quote_asset_symbol: string | null;
  account_base_currency: string | null;
}

async function getAccountAssetBalanceForUser(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: BalanceTxRow[] }> },
  userId: string,
  accountId: number,
  assetSymbol: string
) {
  const normalizedAsset = assetSymbol.trim().toUpperCase();
  let result;
  try {
    result = await client.query(
      `SELECT
         t.type,
         t.quantity,
         COALESCE(t.fee_amount, 0) AS fee_amount,
         t.fee_currency,
         t.quote_asset_symbol,
         a.base_currency AS account_base_currency
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.user_id = $1
         AND t.account_id = $2
         AND t.asset_symbol = $3
       ORDER BY t.datetime ASC, t.id ASC`,
      [userId, accountId, normalizedAsset]
    );
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") {
      throw error;
    }
    result = await client.query(
      `SELECT
         t.type,
         t.quantity,
         COALESCE(t.fee_amount, 0) AS fee_amount,
         t.fee_currency,
         NULL::text AS quote_asset_symbol,
         a.base_currency AS account_base_currency
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.user_id = $1
         AND t.account_id = $2
         AND t.asset_symbol = $3
       ORDER BY t.datetime ASC, t.id ASC`,
      [userId, accountId, normalizedAsset]
    );
  }

  let balance = 0;
  for (const row of result.rows) {
    const delta = computeHoldingDelta({
      type: row.type,
      assetSymbol: normalizedAsset,
      quantity: Number(row.quantity || 0),
      feeAmount: Number(row.fee_amount || 0),
      feeCurrency: row.fee_currency,
      baseCurrency: row.quote_asset_symbol || row.account_base_currency || "USD"
    });
    balance += Number(delta || 0);
  }

  if (Math.abs(balance) <= 1e-12) {
    return 0;
  }
  return balance;
}

export async function GET(request: Request) {
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
  const rl = checkRateLimit({ key: `transactions:get:${userId}:${ip}`, limit: 180, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const assetSymbol = searchParams.get("assetSymbol");
  const accountId = searchParams.get("accountId");

  const conditions: string[] = ["user_id = $1"];
  const values: (string | number)[] = [userId];

  if (assetSymbol) {
    values.push(assetSymbol.toUpperCase());
    conditions.push(`asset_symbol = $${values.length}`);
  }

  if (accountId) {
    values.push(Number(accountId));
    conditions.push(`account_id = $${values.length}`);
  }

  let rows;
  try {
    const result = await pool.query(
      `SELECT id, datetime, type, account_id, asset_symbol, quote_asset_symbol, quantity, price, gross_proceeds, net_proceeds, fee_amount, fee_currency, notes
       FROM transactions
       WHERE ${conditions.join(" AND ")}
       ORDER BY datetime DESC, id DESC`,
      values
    );
    rows = result.rows;
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") {
      throw error;
    }
    const result = await pool.query(
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
       WHERE ${conditions.join(" AND ")}
       ORDER BY datetime DESC, id DESC`,
      values
    );
    rows = result.rows;
  }

  return NextResponse.json(
    rows.map((row) => ({
      ...row,
      notes: decryptText(row.notes)
    }))
  );
}

export async function POST(request: Request) {
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
  const rl = checkRateLimit({ key: `transactions:post:${userId}:${ip}`, limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const client = await pool.connect();
  let inTransaction = false;

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

    const parsed = createTransactionSchema.parse(normalizedPayload);
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

    await client.query("BEGIN");
    inTransaction = true;

    await ensureAssetExists(client, parsed.asset_symbol);
    await ensureAssetExists(client, quoteAssetSymbol);

    const accountOwnership = await client.query(
      "SELECT id FROM accounts WHERE id = $1 AND user_id = $2",
      [parsed.account_id, userId]
    );

    if (!accountOwnership.rows[0]) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return NextResponse.json({ error: "account not owned" }, { status: 403 });
    }

    if (parsed.type === "SELL") {
      const currentBalance = await getAccountAssetBalanceForUser(
        client,
        userId,
        parsed.account_id,
        parsed.asset_symbol
      );
      const requestedReduction = Math.abs(
        computeHoldingDelta({
          type: "SELL",
          assetSymbol: parsed.asset_symbol,
          quantity: parsed.quantity,
          feeAmount: parsed.fee_amount,
          feeCurrency: parsed.fee_currency,
          baseCurrency: quoteAssetSymbol
        })
      );
      if (requestedReduction > currentBalance + 1e-12) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return NextResponse.json(
          { error: "Insufficient balance for this asset" },
          { status: 400 }
        );
      }
    }

    let mainInsert;
    await client.query("SAVEPOINT tx_insert_try_new_columns");
    try {
      mainInsert = await client.query(
        `INSERT INTO transactions (
           user_id, datetime, type, account_id, asset_symbol, quote_asset_symbol, quantity, price, gross_proceeds, net_proceeds, fee_amount, fee_currency, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
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
      await client.query("RELEASE SAVEPOINT tx_insert_try_new_columns");
    } catch (error) {
      if ((error as { code?: string }).code !== "42703") {
        throw error;
      }
      await client.query("ROLLBACK TO SAVEPOINT tx_insert_try_new_columns");
      mainInsert = await client.query(
        `INSERT INTO transactions (
           user_id, datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
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
      await client.query("RELEASE SAVEPOINT tx_insert_try_new_columns");
    }

    const transactionId = Number(mainInsert.rows[0]?.id || 0);
    if (!transactionId) {
      throw new Error("Failed to insert transaction");
    }

    await client.query("COMMIT");
    inTransaction = false;

    revalidatePortfolioViews();
    return NextResponse.json(
      {
        transactionId
      },
      { status: 201 }
    );
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid transaction payload" },
        { status: 400 }
      );
    }
    console.error("[api/transactions][POST] error", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

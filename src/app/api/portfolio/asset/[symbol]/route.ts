import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { normalizeAssetClass } from "@/lib/asset-class";
import { decryptText } from "@/lib/crypto";
import { calculateAssetPortfolio } from "@/lib/portfolio";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";
import { requireUserId, UnauthorizedError } from "@/lib/requireUser";

interface Params {
  params: { symbol: string };
}

export async function GET(_request: Request, { params }: Params) {
  const ip = getClientIp(_request);
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit({ key: `portfolio:asset:${userId}:${ip}`, limit: 120, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const symbol = params.symbol.toUpperCase();
  try {
    let assetResult;
    try {
      assetResult = await pool.query(
        "SELECT symbol, name, type, COALESCE(asset_class, type, 'crypto') AS asset_class, last_price FROM assets WHERE symbol = $1",
        [symbol]
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "42703") {
        throw error;
      }
      assetResult = await pool.query(
        "SELECT symbol, name, type, last_price FROM assets WHERE symbol = $1",
        [symbol]
      );
    }

    if (!assetResult.rows[0]) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const txResult = await pool.query(
      `SELECT
         t.id,
         t.datetime,
         t.type,
         t.account_id,
         t.asset_symbol,
         t.quote_asset_symbol,
         t.quantity,
         t.price,
         t.fee_amount,
         t.fee_currency,
         a.base_currency AS account_base_currency,
         t.notes,
         a.name AS account_name
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.asset_symbol = $1
         AND t.user_id = $2
       ORDER BY t.datetime DESC, t.id DESC`,
      [symbol, userId]
    );

    const metrics = calculateAssetPortfolio(
      txResult.rows,
      Number(assetResult.rows[0].last_price)
    );

    return NextResponse.json({
      asset: {
        ...assetResult.rows[0],
        asset_class: normalizeAssetClass(assetResult.rows[0].asset_class ?? assetResult.rows[0].type)
      },
      metrics,
      transactions: txResult.rows.map((row) => ({ ...row, notes: decryptText(row.notes) }))
    });
  } catch (error) {
    console.error("[api/portfolio/asset/:symbol][GET] error", error);
    return NextResponse.json({ error: "Could not load asset details" }, { status: 500 });
  }
}

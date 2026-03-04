import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { calculateAssetPortfolio } from "@/lib/portfolio";

interface Params {
  params: { symbol: string };
}

export async function GET(_request: Request, { params }: Params) {
  const symbol = params.symbol.toUpperCase();

  const assetResult = await pool.query(
    "SELECT symbol, name, type, last_price FROM assets WHERE symbol = $1",
    [symbol]
  );

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
       t.quantity,
       t.price,
       t.fee_amount,
       t.fee_currency,
       t.notes,
       a.name AS account_name
     FROM transactions t
     LEFT JOIN accounts a ON a.id = t.account_id
     WHERE t.asset_symbol = $1
     ORDER BY t.datetime DESC, t.id DESC`,
    [symbol]
  );

  const metrics = calculateAssetPortfolio(
    txResult.rows.filter((tx) => tx.type === "BUY" || tx.type === "SELL"),
    Number(assetResult.rows[0].last_price)
  );

  return NextResponse.json({
    asset: assetResult.rows[0],
    metrics,
    transactions: txResult.rows
  });
}

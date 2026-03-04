import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { calculateAssetPortfolio } from "@/lib/portfolio";
import { refreshPricesIfStale } from "@/lib/prices";

export async function GET() {
  try {
    await refreshPricesIfStale(false);
  } catch {
    // Continue with stored last_price if provider or refresh fails.
  }

  const assetsResult = await pool.query(
    "SELECT symbol, name, type, last_price FROM assets ORDER BY symbol ASC"
  );

  const txResult = await pool.query(
    `SELECT id, datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes
     FROM transactions
     WHERE type IN ('BUY', 'SELL')
     ORDER BY datetime ASC, id ASC`
  );

  const holdings = assetsResult.rows.map((asset) => {
    const assetTxs = txResult.rows.filter((tx) => tx.asset_symbol === asset.symbol);
    const metrics = calculateAssetPortfolio(assetTxs, Number(asset.last_price));

    return {
      symbol: asset.symbol,
      name: asset.name,
      type: asset.type,
      lastPrice: Number(asset.last_price),
      ...metrics
    };
  });

  const totalWorth = holdings.reduce((acc, item) => acc + item.marketValue, 0);
  const totalPnL = holdings.reduce((acc, item) => acc + item.totalPnL, 0);

  return NextResponse.json({
    totalWorth,
    totalPnL,
    holdings
  });
}

import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { normalizeAssetClass } from "@/lib/asset-class";
import { calculateAssetPortfolio } from "@/lib/portfolio";
import { refreshPricesIfStale } from "@/lib/prices";
import { requireUserId, UnauthorizedError } from "@/lib/requireUser";

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await refreshPricesIfStale(false);
  } catch {
    // Continue with stored last_price if provider or refresh fails.
  }

  try {
    let assetsResult;
    try {
      assetsResult = await pool.query(
        "SELECT symbol, name, type, COALESCE(asset_class, type, 'crypto') AS asset_class, last_price FROM assets ORDER BY symbol ASC"
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "42703") {
        throw error;
      }
      assetsResult = await pool.query(
        "SELECT symbol, name, type, last_price FROM assets ORDER BY symbol ASC"
      );
    }

    const txResult = await pool.query(
      `SELECT id, datetime, type, account_id, asset_symbol, quote_asset_symbol, quantity, price, fee_amount, fee_currency, notes, NULL::text AS account_base_currency
       FROM transactions
       WHERE user_id = $1
       ORDER BY datetime ASC, id ASC`,
      [userId]
    );

    const holdings = assetsResult.rows.map((asset) => {
      const assetTxs = txResult.rows.filter((tx) => tx.asset_symbol === asset.symbol);
      const metrics = calculateAssetPortfolio(assetTxs, Number(asset.last_price));

    return {
      symbol: asset.symbol,
      name: asset.name,
      type: normalizeAssetClass(asset.asset_class ?? asset.type),
      asset_class: normalizeAssetClass(asset.asset_class ?? asset.type),
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
  } catch (error) {
    console.error("[api/portfolio/summary][GET] error", error);
    return NextResponse.json({ error: "Could not load portfolio summary" }, { status: 500 });
  }
}

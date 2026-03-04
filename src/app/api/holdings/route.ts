import { NextResponse } from "next/server";
import { getHoldingsWithStats } from "@/lib/holdings";
import { refreshPricesIfStale } from "@/lib/prices";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await refreshPricesIfStale(false);
  } catch {
    // Continue with stored last_price if provider or refresh fails.
  }

  const holdings = await getHoldingsWithStats();

  return NextResponse.json(
    holdings.map((row) => ({
      symbol: row.symbol,
      name: row.name,
      type: row.type,
      owned: row.ownedQty,
      market_value: row.marketValue,
      pnl: row.totalPnL,
      last_price: row.last_price,
      updated_at: row.updated_at,
      tx_count: row.txCount,
      account: row.account_name
    }))
  );
}

import { NextResponse } from "next/server";
import { getHoldingsWithStats } from "@/lib/holdings";
import { refreshPricesIfStale } from "@/lib/prices";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";
import { requireUserId, UnauthorizedError } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

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

  const rl = checkRateLimit({ key: `holdings:get:${userId}:${ip}`, limit: 120, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    try {
      await refreshPricesIfStale(false);
    } catch {
      // Continue with stored last_price if provider or refresh fails.
    }

    const holdings = await getHoldingsWithStats(userId);

    return NextResponse.json(
      holdings.map((row) => ({
        symbol: row.symbol,
        name: row.name,
        type: row.type,
        asset_class: row.asset_class,
        owned: row.ownedQty,
        market_value: row.marketValue,
        pnl: row.totalPnL,
        last_price: row.last_price,
        updated_at: row.updated_at,
        tx_count: row.txCount,
        account: row.account_name
      }))
    );
  } catch (error) {
    console.error("[api/holdings][GET] error", error);
    return NextResponse.json({ error: "Could not load holdings" }, { status: 500 });
  }
}

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
  return NextResponse.json(holdings);
}

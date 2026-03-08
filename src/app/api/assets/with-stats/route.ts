import { NextResponse } from "next/server";
import { getHoldingsWithStats } from "@/lib/holdings";
import { refreshPricesIfStale } from "@/lib/prices";
import { requireUserId, UnauthorizedError } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

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
  const holdings = await getHoldingsWithStats(userId);
  return NextResponse.json(holdings);
}

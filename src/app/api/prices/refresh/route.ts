import { NextResponse } from "next/server";
import { refreshPricesIfStale } from "@/lib/prices";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  const onlyCrypto = searchParams.get("onlyCrypto") !== "0";

  try {
    const result = await refreshPricesIfStale({ force, onlyCrypto });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to refresh prices", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const force = payload?.force === true || payload?.force === 1 || payload?.force === "1";
    const onlyCrypto = payload?.onlyCrypto !== false;
    const symbols = Array.isArray(payload?.symbols)
      ? payload.symbols.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const result = await refreshPricesIfStale({ force, symbols, onlyCrypto });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to refresh prices", details: String(error) },
      { status: 500 }
    );
  }
}

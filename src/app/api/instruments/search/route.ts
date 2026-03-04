import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  thumb?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const type = (searchParams.get("type") || "crypto").trim().toLowerCase();
  const limitRaw = Number(searchParams.get("limit") || 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 10;

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  if (type !== "crypto") {
    return NextResponse.json([]);
  }

  try {
    const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({
        warning: "provider_unavailable",
        items: []
      });
    }

    const payload = (await res.json()) as { coins?: CoinGeckoCoin[] };
    const queryLower = q.toLowerCase();

    const items = (payload.coins || [])
      .filter((coin) => {
        const symbol = coin.symbol?.toLowerCase() || "";
        const name = coin.name?.toLowerCase() || "";
        return symbol.includes(queryLower) || name.includes(queryLower);
      })
      .slice(0, limit)
      .map((coin) => ({
        id: coin.id,
        symbol: (coin.symbol || "").toUpperCase(),
        name:
          coin.id === "oasis-network"
            ? "Oasis Network"
            : coin.name || (coin.symbol || "").toUpperCase(),
        thumb: coin.thumb || null
      }));

    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({
      warning: "provider_unavailable",
      items: []
    });
  }
}

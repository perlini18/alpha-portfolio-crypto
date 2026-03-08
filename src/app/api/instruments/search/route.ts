import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  thumb?: string;
}

const querySchema = z.object({
  q: z.string().trim().min(2).max(64),
  type: z.enum(["crypto"]).default("crypto"),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") || "",
    type: (searchParams.get("type") || "crypto").trim().toLowerCase(),
    limit: searchParams.get("limit") || "10"
  });
  if (!parsed.success) {
    return NextResponse.json([]);
  }
  const { q, type, limit } = parsed.data;

  if (type !== "crypto") return NextResponse.json([]);

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
    console.error("[api/instruments/search][GET] provider unavailable");
    return NextResponse.json({
      warning: "provider_unavailable",
      items: []
    });
  }
}

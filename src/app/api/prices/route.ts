import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { SYMBOL_TO_COINGECKO_ID } from "@/lib/coingecko";

export const dynamic = "force-dynamic";

interface AssetIdRow {
  symbol: string;
  coingecko_id: string | null;
  type?: string | null;
  asset_class?: string | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols") || "";
  const symbols = Array.from(
    new Set(
      symbolsParam
        .split(",")
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
    )
  );

  if (!symbols.length) {
    return NextResponse.json(
      { prices: {}, asOf: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const symbolToId: Record<string, string> = {};

  try {
    const { rows } = await pool.query<AssetIdRow>(
      `SELECT symbol, coingecko_id, type, COALESCE(asset_class, type, 'crypto') AS asset_class
       FROM assets
       WHERE symbol = ANY($1::text[])`,
      [symbols]
    );
    for (const row of rows) {
      const symbol = String(row.symbol || "").toUpperCase();
      const assetClass = row.asset_class || row.type || "crypto";
      if (assetClass !== "crypto") {
        continue;
      }
      const id = String(row.coingecko_id || "").trim();
      if (symbol && id) {
        symbolToId[symbol] = id;
      }
    }
  } catch {
    // If coingecko_id is unavailable in schema, fallback to static mapping below.
  }

  for (const symbol of symbols) {
    if (!symbolToId[symbol] && SYMBOL_TO_COINGECKO_ID[symbol]) {
      symbolToId[symbol] = SYMBOL_TO_COINGECKO_ID[symbol];
    }
  }

  const ids = Array.from(new Set(Object.values(symbolToId)));
  if (!ids.length) {
    return NextResponse.json(
      { prices: {}, asOf: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const query = new URLSearchParams({
      ids: ids.join(","),
      vs_currencies: "usd"
    });

    const providerRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?${query.toString()}`, {
      cache: "no-store"
    });

    if (!providerRes.ok) {
      console.error("[api/prices][GET] provider error", { status: providerRes.status });
      return NextResponse.json(
        { error: "Provider error" },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = (await providerRes.json()) as Record<string, { usd?: number }>;
    const prices: Record<string, number> = {};

    for (const symbol of symbols) {
      const id = symbolToId[symbol];
      const value = id ? data[id]?.usd : undefined;
      if (typeof value === "number" && value > 0) {
        prices[symbol] = value;
      }
    }

    return NextResponse.json(
      {
        prices,
        asOf: new Date().toISOString()
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/prices][GET] error", error);
    return NextResponse.json(
      { error: "Failed to fetch live prices" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

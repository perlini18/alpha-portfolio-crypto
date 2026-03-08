import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
const MAP_TTL_MS = 45_000;

let cache: {
  expiresAt: number;
  prices: Record<string, number>;
  updatedAt: string;
} | null = null;

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("force") === "1";
    const now = Date.now();
    if (!force && cache && cache.expiresAt > now) {
      return NextResponse.json(
        {
          prices: cache.prices,
          updatedAt: cache.updatedAt
        },
        {
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const { rows } = await pool.query<{ symbol: string; last_price: number | null }>(
      `SELECT symbol, last_price
       FROM assets
       ORDER BY symbol ASC`
    );

    const prices: Record<string, number> = {};

    for (const row of rows) {
      const symbol = String(row.symbol || "").toUpperCase();
      const price = Number(row.last_price ?? 0);
      if (symbol && Number.isFinite(price) && price > 0) {
        prices[symbol] = price;
      }
    }

    const updatedAt = new Date().toISOString();
    cache = {
      prices,
      updatedAt,
      expiresAt: now + MAP_TTL_MS
    };

    return NextResponse.json(
      {
        prices,
        updatedAt
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("[api/prices/map][GET] error", error);
    return NextResponse.json(
      { error: "Failed to load prices map" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

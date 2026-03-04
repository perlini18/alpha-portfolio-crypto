import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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

    return NextResponse.json(
      {
        prices,
        updatedAt: new Date().toISOString()
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load prices map", details: String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

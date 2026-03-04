import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  provider: z.literal("coingecko"),
  coingecko_id: z.string().trim().min(1),
  symbol: z.string().trim().min(1),
  name: z.string().trim().min(1)
});

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const symbol = payload.symbol.toUpperCase();
    const coingeckoSymbol = payload.symbol.toLowerCase();

    let result;
    try {
      result = await pool.query(
        `INSERT INTO assets (symbol, name, type, coingecko_id, coingecko_symbol, provider, provider_id, last_price)
         VALUES ($1, $2, 'crypto', $3, $4, 'coingecko', $3, 0)
         ON CONFLICT (symbol) DO UPDATE
         SET name = EXCLUDED.name,
             type = EXCLUDED.type,
             coingecko_id = EXCLUDED.coingecko_id,
             coingecko_symbol = EXCLUDED.coingecko_symbol,
             provider = EXCLUDED.provider,
             provider_id = EXCLUDED.provider_id
         RETURNING symbol, name, type, coingecko_id, coingecko_symbol, provider, provider_id, last_price, updated_at`,
        [symbol, payload.name, payload.coingecko_id, coingeckoSymbol]
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "42703") {
        throw error;
      }

      result = await pool.query(
        `INSERT INTO assets (symbol, name, type, provider_id, last_price)
         VALUES ($1, $2, 'crypto', $3, 0)
         ON CONFLICT (symbol) DO UPDATE
         SET name = EXCLUDED.name,
             type = EXCLUDED.type,
             provider_id = EXCLUDED.provider_id
         RETURNING symbol, name, type, provider_id, last_price, updated_at`,
        [symbol, payload.name, payload.coingecko_id]
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Upsert failed", details: String(error) }, { status: 500 });
  }
}

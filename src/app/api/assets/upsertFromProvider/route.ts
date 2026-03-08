import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { normalizeAssetClass } from "@/lib/asset-class";
import { requireUserId, UnauthorizedError } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  provider: z.literal("coingecko"),
  coingecko_id: z.string().trim().min(1),
  symbol: z.string().trim().min(1),
  name: z.string().trim().min(1)
});

export async function POST(request: Request) {
  try {
    await requireUserId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = payloadSchema.parse(await request.json());
    const symbol = payload.symbol.toUpperCase();
    const coingeckoSymbol = payload.symbol.toLowerCase();

    let result;
    try {
      result = await pool.query(
        `INSERT INTO assets (symbol, name, type, asset_class, coingecko_id, coingecko_symbol, provider, provider_id, last_price)
         VALUES ($1, $2, 'crypto', 'crypto', $3, $4, 'coingecko', $3, 0)
         ON CONFLICT (symbol) DO UPDATE
         SET name = EXCLUDED.name,
             type = EXCLUDED.type,
             asset_class = EXCLUDED.asset_class,
             coingecko_id = EXCLUDED.coingecko_id,
             coingecko_symbol = EXCLUDED.coingecko_symbol,
             provider = EXCLUDED.provider,
             provider_id = EXCLUDED.provider_id
         RETURNING symbol, name, type, asset_class, coingecko_id, coingecko_symbol, provider, provider_id, last_price, updated_at`,
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

    const row = result.rows[0] as Record<string, unknown>;
    return NextResponse.json({
      ...row,
      asset_class: normalizeAssetClass(
        typeof row.asset_class === "string" ? row.asset_class : typeof row.type === "string" ? row.type : null
      )
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid payload" }, { status: 400 });
    }
    console.error("[api/assets/upsertFromProvider][POST] error", error);
    return NextResponse.json({ error: "Upsert failed" }, { status: 500 });
  }
}

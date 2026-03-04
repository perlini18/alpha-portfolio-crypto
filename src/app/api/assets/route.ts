import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { createAssetSchema, patchAssetPriceSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();

  const hasQuery = Boolean(query);
  const values = hasQuery ? [`%${query}%`] : [];
  const queryWithProviderColumns = hasQuery
    ? `SELECT symbol, name, type, provider_id, coingecko_id, coingecko_symbol, provider, last_price, updated_at, last_price_updated_at
       FROM assets
       WHERE symbol ILIKE $1 OR name ILIKE $1
       ORDER BY symbol ASC`
    : `SELECT symbol, name, type, provider_id, coingecko_id, coingecko_symbol, provider, last_price, updated_at, last_price_updated_at
       FROM assets
       ORDER BY symbol ASC`;
  const queryFallback = hasQuery
    ? `SELECT symbol, name, type, provider_id, coingecko_id, coingecko_symbol, last_price, updated_at
       FROM assets
       WHERE symbol ILIKE $1 OR name ILIKE $1
       ORDER BY symbol ASC`
    : `SELECT symbol, name, type, provider_id, coingecko_id, coingecko_symbol, last_price, updated_at
       FROM assets
       ORDER BY symbol ASC`;
  const queryFallbackWithoutCoingecko = hasQuery
    ? `SELECT symbol, name, type, provider_id, last_price, updated_at
       FROM assets
       WHERE symbol ILIKE $1 OR name ILIKE $1
       ORDER BY symbol ASC`
    : `SELECT symbol, name, type, provider_id, last_price, updated_at
       FROM assets
       ORDER BY symbol ASC`;
  const queryFallbackWithoutProviderId = hasQuery
    ? `SELECT symbol, name, type, last_price, updated_at
       FROM assets
       WHERE symbol ILIKE $1 OR name ILIKE $1
       ORDER BY symbol ASC`
    : `SELECT symbol, name, type, last_price, updated_at
       FROM assets
       ORDER BY symbol ASC`;

  let rows: unknown[];
  try {
    const result = await pool.query(queryWithProviderColumns, values);
    rows = result.rows;
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") {
      throw error;
    }
    try {
      const fallback = await pool.query(queryFallback, values);
      rows = fallback.rows;
    } catch (nestedError) {
      if ((nestedError as { code?: string }).code !== "42703") {
        throw nestedError;
      }
      try {
        const fallbackNoCoingecko = await pool.query(queryFallbackWithoutCoingecko, values);
        rows = fallbackNoCoingecko.rows;
      } catch (deepError) {
        if ((deepError as { code?: string }).code !== "42703") {
          throw deepError;
        }
        const fallbackNoProviderId = await pool.query(queryFallbackWithoutProviderId, values);
        rows = fallbackNoProviderId.rows;
      }
    }
  }

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const baseSchema = z.object({
      symbol: z.string(),
      name: z.string().optional().nullable(),
      type: z.enum(["crypto", "stock"]),
      provider_id: z.string().trim().optional().nullable(),
      coingecko_id: z.string().trim().optional().nullable(),
      coingecko_symbol: z.string().trim().optional().nullable(),
      provider: z.string().trim().optional().nullable()
    });

    const raw = baseSchema.parse(payload);
    const symbol = raw.symbol.trim().toUpperCase();
    const name = (raw.name ?? "").trim() || symbol;
    const parsed = createAssetSchema.parse({
      symbol,
      name,
      type: raw.type,
      last_price: 0
    });

    const coingeckoId = raw.coingecko_id || raw.provider_id || null;
    const coingeckoSymbol = raw.coingecko_symbol || (coingeckoId ? symbol.toLowerCase() : null);
    const provider = raw.provider || (coingeckoId ? "coingecko" : null);
    const providerId = coingeckoId;
    let insertResult;
    try {
      insertResult = await pool.query(
        `INSERT INTO assets (symbol, name, type, provider_id, coingecko_id, coingecko_symbol, provider, last_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
         ON CONFLICT (symbol) DO UPDATE
         SET name = EXCLUDED.name,
             type = EXCLUDED.type,
             provider_id = COALESCE(EXCLUDED.provider_id, assets.provider_id),
             coingecko_id = COALESCE(EXCLUDED.coingecko_id, assets.coingecko_id),
             coingecko_symbol = COALESCE(EXCLUDED.coingecko_symbol, assets.coingecko_symbol),
             provider = COALESCE(EXCLUDED.provider, assets.provider)
         RETURNING symbol, name, type, provider_id, coingecko_id, coingecko_symbol, provider`,
        [parsed.symbol, parsed.name, parsed.type, providerId, coingeckoId, coingeckoSymbol, provider]
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "42703") {
        throw error;
      }
      try {
        insertResult = await pool.query(
          `INSERT INTO assets (symbol, name, type, provider_id, last_price)
           VALUES ($1, $2, $3, $4, 0)
           ON CONFLICT (symbol) DO UPDATE
           SET name = EXCLUDED.name,
               type = EXCLUDED.type,
               provider_id = COALESCE(EXCLUDED.provider_id, assets.provider_id)
           RETURNING symbol, name, type, provider_id`,
          [parsed.symbol, parsed.name, parsed.type, providerId]
        );
      } catch (nestedError) {
        if ((nestedError as { code?: string }).code !== "42703") {
          throw nestedError;
        }
        insertResult = await pool.query(
          `INSERT INTO assets (symbol, name, type, last_price)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (symbol) DO UPDATE
           SET name = EXCLUDED.name,
               type = EXCLUDED.type
           RETURNING symbol, name, type`,
          [parsed.symbol, parsed.name, parsed.type]
        );
      }
    }

    if (insertResult.rows[0]) {
      return NextResponse.json(insertResult.rows[0], { status: 200 });
    }
    return NextResponse.json({ error: "Asset could not be created" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json({ error: firstIssue?.message || "Invalid asset payload" }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Invalid asset payload" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json();
    const parsed = patchAssetPriceSchema.parse(payload);

    let rows: unknown[];
    try {
      const result = await pool.query(
        `UPDATE assets
         SET last_price = $2, updated_at = NOW(), last_price_updated_at = NOW()
         WHERE symbol = $1
         RETURNING symbol, name, type, last_price, updated_at`,
        [parsed.symbol, parsed.last_price]
      );
      rows = result.rows;
    } catch (error) {
      if ((error as { code?: string }).code !== "42703") {
        throw error;
      }

      const fallbackResult = await pool.query(
        `UPDATE assets
         SET last_price = $2, updated_at = NOW()
         WHERE symbol = $1
         RETURNING symbol, name, type, last_price, updated_at`,
        [parsed.symbol, parsed.last_price]
      );
      rows = fallbackResult.rows;
    }

    if (!rows[0]) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid patch payload", details: String(error) },
      { status: 400 }
    );
  }
}

import { pool } from "@/lib/db";
import { normalizeAssetClass } from "@/lib/asset-class";
import { SYMBOL_TO_COINGECKO_ID } from "@/lib/coingecko";

export const PRICE_TTL_MS = 5 * 60 * 1000;
const UI_PRICE_STALE_MS = 30 * 60 * 1000;

let hasLastPriceUpdatedAtCache: boolean | null = null;
let hasCoingeckoIdCache: boolean | null = null;
let hasProviderIdCache: boolean | null = null;
let hasAssetClassCache: boolean | null = null;

export function hasLiveCryptoMapping(symbol: string) {
  return Boolean(SYMBOL_TO_COINGECKO_ID[symbol.toUpperCase()]);
}

export function isAssetLivePriceSupported(type: string, symbol: string, providerId?: string | null) {
  if (type !== "crypto") {
    return false;
  }

  if (providerId && providerId.trim().length > 0) {
    return true;
  }

  return hasLiveCryptoMapping(symbol);
}

export function isStale(lastUpdatedAt: Date | null): boolean {
  if (!lastUpdatedAt) {
    return true;
  }

  const ts = lastUpdatedAt.getTime();
  if (!Number.isFinite(ts)) {
    return true;
  }

  return Date.now() - ts > PRICE_TTL_MS;
}

export function isUiPriceStale(lastUpdatedAt: Date | null): boolean {
  if (!lastUpdatedAt) {
    return true;
  }

  const ts = lastUpdatedAt.getTime();
  if (!Number.isFinite(ts)) {
    return true;
  }

  return Date.now() - ts > UI_PRICE_STALE_MS;
}

async function hasLastPriceUpdatedAtColumn() {
  if (hasLastPriceUpdatedAtCache !== null) {
    return hasLastPriceUpdatedAtCache;
  }

  const { rows } = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'assets'
       AND column_name = 'last_price_updated_at'
     LIMIT 1`
  );

  hasLastPriceUpdatedAtCache = Boolean(rows[0]);
  return hasLastPriceUpdatedAtCache;
}

async function hasCoingeckoIdColumn() {
  if (hasCoingeckoIdCache !== null) {
    return hasCoingeckoIdCache;
  }

  const { rows } = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'assets'
       AND column_name = 'coingecko_id'
     LIMIT 1`
  );

  hasCoingeckoIdCache = Boolean(rows[0]);
  return hasCoingeckoIdCache;
}

async function hasProviderIdColumn() {
  if (hasProviderIdCache !== null) {
    return hasProviderIdCache;
  }

  const { rows } = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'assets'
       AND column_name = 'provider_id'
     LIMIT 1`
  );

  hasProviderIdCache = Boolean(rows[0]);
  return hasProviderIdCache;
}

async function hasAssetClassColumn() {
  if (hasAssetClassCache !== null) {
    return hasAssetClassCache;
  }

  const { rows } = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'assets'
       AND column_name = 'asset_class'
     LIMIT 1`
  );

  hasAssetClassCache = Boolean(rows[0]);
  return hasAssetClassCache;
}

async function fetchCryptoPricesByIdPairs(pairs: Array<{ symbol: string; coingecko_id: string }>) {
  const uniquePairs: Array<{ symbol: string; coingecko_id: string }> = [];
  const seen = new Set<string>();

  for (const pair of pairs) {
    const symbol = pair.symbol.toUpperCase();
    const id = pair.coingecko_id.trim();
    const key = `${symbol}:${id}`;
    if (!id || seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniquePairs.push({ symbol, coingecko_id: id });
  }

  if (!uniquePairs.length) {
    return {} as Record<string, number>;
  }

  const ids = Array.from(new Set(uniquePairs.map((pair) => pair.coingecko_id)));
  const query = new URLSearchParams({
    ids: ids.join(","),
    vs_currencies: "usd"
  });

  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?${query.toString()}`, {
    cache: "no-store"
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CoinGecko error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as Record<string, { usd?: number }>;
  const pricesBySymbol: Record<string, number> = {};
  for (const pair of uniquePairs) {
    const value = data[pair.coingecko_id]?.usd;
    if (typeof value === "number" && value > 0) {
      pricesBySymbol[pair.symbol] = value;
    }
  }

  return pricesBySymbol;
}

interface RefreshPricesOptions {
  force?: boolean;
  symbols?: string[];
  onlyCrypto?: boolean;
}

interface RefreshFailure {
  symbol: string;
  coingecko_id: string | null;
  reason: string;
}

interface AssetRow {
  symbol: string;
  type: string;
  asset_class?: string | null;
  last_price: number | null;
  updated_at: string | null;
  last_price_updated_at?: string | null;
  coingecko_id?: string | null;
  provider_id?: string | null;
}

export async function refreshPricesIfStale(options: boolean | RefreshPricesOptions = false) {
  const force = typeof options === "boolean" ? options : Boolean(options.force);
  const onlyCrypto = typeof options === "boolean" ? true : options.onlyCrypto ?? true;
  const requestedSymbols =
    typeof options === "boolean"
      ? []
      : Array.from(new Set((options.symbols ?? []).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));

  const hasLastPriceUpdatedAt = await hasLastPriceUpdatedAtColumn();
  const hasCoingeckoId = await hasCoingeckoIdColumn();
  const hasProviderId = await hasProviderIdColumn();
  const hasAssetClass = await hasAssetClassColumn();

  const selectCols = ["symbol", "type", "last_price", "updated_at"];
  if (hasAssetClass) {
    selectCols.push("asset_class");
  }
  if (hasLastPriceUpdatedAt) {
    selectCols.push("last_price_updated_at");
  }
  if (hasCoingeckoId) {
    selectCols.push("coingecko_id");
  } else if (hasProviderId) {
    selectCols.push("provider_id");
  }

  const where: string[] = [];
  const params: unknown[] = [];

  if (onlyCrypto) {
    where.push(hasAssetClass ? "asset_class = 'crypto'" : "type = 'crypto'");
  }
  if (requestedSymbols.length) {
    params.push(requestedSymbols);
    where.push(`symbol = ANY($${params.length}::text[])`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const query = `SELECT ${selectCols.join(", ")} FROM assets ${whereSql} ORDER BY symbol ASC`;
  const rowsResult = await pool.query(query, params);
  const rows = rowsResult.rows as AssetRow[];

  const failed: RefreshFailure[] = [];
  const staleRows: AssetRow[] = [];

  for (const row of rows) {
    const assetClass = normalizeAssetClass(hasAssetClass ? row.asset_class : row.type);
    if (onlyCrypto && assetClass !== "crypto") {
      continue;
    }

    const lastUpdatedRaw = hasLastPriceUpdatedAt ? (row.last_price_updated_at ?? row.updated_at) : row.updated_at;
    const lastUpdated = lastUpdatedRaw ? new Date(lastUpdatedRaw) : null;

    if (force || isStale(lastUpdated) || Number(row.last_price ?? 0) <= 0) {
      staleRows.push(row);
    }
  }

  if (!staleRows.length) {
    return { updated: 0, failed };
  }

  const idPairs: Array<{ symbol: string; coingecko_id: string }> = [];
  for (const row of staleRows) {
    const symbol = String(row.symbol || "").toUpperCase();
    const coingeckoId = String(
      (hasCoingeckoId ? row.coingecko_id : null) || (hasProviderId ? row.provider_id : null) || ""
    ).trim();

    if (!coingeckoId) {
      failed.push({
        symbol,
        coingecko_id: null,
        reason: "missing provider id"
      });
      continue;
    }

    idPairs.push({ symbol, coingecko_id: coingeckoId });
  }

  let pricesBySymbol: Record<string, number> = {};
  if (idPairs.length) {
    try {
      pricesBySymbol = await fetchCryptoPricesByIdPairs(idPairs);
    } catch (error) {
      for (const pair of idPairs) {
        failed.push({
          symbol: pair.symbol,
          coingecko_id: pair.coingecko_id,
          reason: `provider error: ${String(error)}`
        });
      }
      return { updated: 0, failed };
    }
  }

  const updateQuery = hasLastPriceUpdatedAt
    ? `UPDATE assets
       SET last_price = $2, updated_at = NOW(), last_price_updated_at = NOW()
       WHERE symbol = $1`
    : `UPDATE assets
       SET last_price = $2, updated_at = NOW()
       WHERE symbol = $1`;

  let updated = 0;
  for (const row of staleRows) {
    const symbol = String(row.symbol || "").toUpperCase();
    const coingeckoId = String(
      (hasCoingeckoId ? row.coingecko_id : null) || (hasProviderId ? row.provider_id : null) || ""
    ).trim();
    const nextPrice = pricesBySymbol[symbol];

    if (!coingeckoId) {
      continue;
    }

    if (typeof nextPrice !== "number" || nextPrice <= 0) {
      failed.push({
        symbol,
        coingecko_id: coingeckoId,
        reason: "price unavailable"
      });
      continue;
    }

    await pool.query(updateQuery, [symbol, nextPrice]);
    updated += 1;
  }

  return { updated, failed };
}

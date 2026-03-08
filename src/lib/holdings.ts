import { pool } from "@/lib/db";
import { normalizeAssetClass, type AssetClass } from "@/lib/asset-class";
import { calculateAssetPortfolio } from "@/lib/portfolio";
import { isAssetLivePriceSupported } from "@/lib/prices";
import { computeHoldingDelta, computeSecondaryAssetDeltas } from "@/lib/transaction-math";
import type { TransactionType } from "@/lib/types";

export interface HoldingWithStats {
  key: string;
  symbol: string;
  name: string;
  type: AssetClass;
  asset_class: AssetClass;
  account_id: number | null;
  account_name: string | null;
  last_price: number;
  price_updated_at: string | null;
  updated_at: string | null;
  noLivePrice: boolean;
  accounts: string[];
  accountsCount: number;
  ownedQty: number;
  avgCost: number;
  marketValue: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  txCount: number;
}

interface TxRow {
  id: number;
  datetime: string;
  type: TransactionType;
  account_id: number | null;
  asset_symbol: string;
  quote_asset_symbol?: string | null;
  quantity: number;
  price: number;
  gross_proceeds?: number | null;
  net_proceeds?: number | null;
  fee_amount: number;
  fee_currency: string | null;
  account_base_currency?: string | null;
  account_name: string | null;
  synthetic?: boolean;
}

interface TxRowWithAssetMeta extends TxRow {
  asset_name?: string | null;
  asset_type?: "crypto" | "stock" | null;
  asset_class?: "crypto" | "stock" | null;
  last_price?: number | null;
  last_price_updated_at?: string | null;
  asset_updated_at?: string | null;
  provider_id?: string | null;
  coingecko_id?: string | null;
}

interface AssetMetaRow {
  symbol: string;
  name?: string | null;
  type?: "crypto" | "stock" | null;
  asset_class?: "crypto" | "stock" | null;
  last_price?: number | null;
  asset_updated_at?: string | null;
  last_price_updated_at?: string | null;
  provider_id?: string | null;
  coingecko_id?: string | null;
}

function resolveQuoteDeltaFromStored(tx: Pick<TxRowWithAssetMeta, "type" | "quantity" | "price" | "gross_proceeds" | "net_proceeds">) {
  const gross = Number(tx.gross_proceeds ?? tx.quantity * tx.price);
  const net = Number(tx.net_proceeds ?? gross);
  const type = String(tx.type || "").toUpperCase();
  if (type === "BUY") {
    return -Math.max(0, net);
  }
  if (type === "SELL") {
    return Math.max(0, net || gross);
  }
  return 0;
}

export async function getHoldingsWithStats(userId: string): Promise<HoldingWithStats[]> {
  let txResult;
  try {
    txResult = await pool.query(
      `SELECT
         t.id,
         t.datetime,
         t.type,
         t.account_id,
         t.asset_symbol,
         t.quote_asset_symbol,
         t.quantity,
         t.price,
         t.gross_proceeds,
         t.net_proceeds,
         t.fee_amount,
         t.fee_currency,
         a.base_currency AS account_base_currency,
         a.name AS account_name,
         ass.name AS asset_name,
         ass.type AS asset_type,
         ass.asset_class AS asset_class,
         ass.last_price AS last_price,
         ass.updated_at AS asset_updated_at,
         ass.provider_id AS provider_id,
         ass.coingecko_id AS coingecko_id,
         ass.last_price_updated_at AS last_price_updated_at
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       LEFT JOIN assets ass ON ass.symbol = t.asset_symbol
       WHERE t.user_id = $1
       ORDER BY t.datetime ASC, t.id ASC`,
      [userId]
    );
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") {
      throw error;
    }
    try {
      txResult = await pool.query(
        `SELECT
           t.id,
           t.datetime,
           t.type,
           t.account_id,
           t.asset_symbol,
           t.quote_asset_symbol,
           t.quantity,
           t.price,
           t.gross_proceeds,
           t.net_proceeds,
           t.fee_amount,
           t.fee_currency,
           a.base_currency AS account_base_currency,
           a.name AS account_name,
           ass.name AS asset_name,
           ass.type AS asset_type,
           ass.asset_class AS asset_class,
           ass.last_price AS last_price,
           ass.updated_at AS asset_updated_at,
           ass.provider_id AS provider_id
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.account_id
        LEFT JOIN assets ass ON ass.symbol = t.asset_symbol
        WHERE t.user_id = $1
        ORDER BY t.datetime ASC, t.id ASC`,
        [userId]
      );
    } catch (nestedError) {
      if ((nestedError as { code?: string }).code !== "42703") {
        throw nestedError;
      }
      txResult = await pool.query(
        `SELECT
           t.id,
           t.datetime,
           t.type,
           t.account_id,
           t.asset_symbol,
           t.quote_asset_symbol,
           t.quantity,
           t.price,
           t.gross_proceeds,
           t.net_proceeds,
           t.fee_amount,
           t.fee_currency,
           a.base_currency AS account_base_currency,
           a.name AS account_name,
           ass.name AS asset_name,
           ass.type AS asset_type,
           ass.last_price AS last_price,
           ass.updated_at AS asset_updated_at
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.account_id
        LEFT JOIN assets ass ON ass.symbol = t.asset_symbol
        WHERE t.user_id = $1
        ORDER BY t.datetime ASC, t.id ASC`,
        [userId]
      );
    }
  }

  let assetsMetaResult;
  try {
    assetsMetaResult = await pool.query(
      `SELECT
         symbol,
         name,
         type,
         COALESCE(asset_class, type, 'crypto') AS asset_class,
         last_price,
         updated_at AS asset_updated_at,
         last_price_updated_at,
         provider_id,
         coingecko_id
       FROM assets`
    );
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") {
      throw error;
    }
    assetsMetaResult = await pool.query(
      `SELECT
         symbol,
         name,
         type AS asset_class,
         type,
         last_price,
         updated_at AS asset_updated_at,
         NULL::timestamp AS last_price_updated_at,
         NULL::text AS provider_id,
         NULL::text AS coingecko_id
       FROM assets`
    );
  }
  const assetsMetaBySymbol = new Map<string, AssetMetaRow>();
  for (const row of assetsMetaResult.rows as AssetMetaRow[]) {
    assetsMetaBySymbol.set(String(row.symbol || "").toUpperCase(), row);
  }

  const expandedRows: TxRowWithAssetMeta[] = [];
  const balancesByAccount = new Map<number, Map<string, number>>();
  let syntheticId = -1;
  for (const tx of txResult.rows as TxRowWithAssetMeta[]) {
    expandedRows.push(tx);
    const accountId = Number(tx.account_id ?? 0);
    const accountBalances = balancesByAccount.get(accountId) || new Map<string, number>();
    const baseSymbol = String(tx.asset_symbol || "").toUpperCase();
    if (baseSymbol) {
      const baseDelta = Number(
        computeHoldingDelta({
          type: tx.type,
          assetSymbol: baseSymbol,
          quantity: tx.quantity,
          feeAmount: tx.fee_amount,
          feeCurrency: tx.fee_currency,
          baseCurrency: tx.quote_asset_symbol || tx.account_base_currency || "USD"
        })
      );
      const currentBase = Number(accountBalances.get(baseSymbol) || 0);
      accountBalances.set(baseSymbol, Math.max(0, currentBase + baseDelta));
    }

    const secondaryDeltas = computeSecondaryAssetDeltas({
      type: tx.type,
      assetSymbol: tx.asset_symbol,
      quoteAssetSymbol: tx.quote_asset_symbol || tx.account_base_currency || "USD",
      quantity: tx.quantity,
      price: tx.price,
      feeAmount: tx.fee_amount,
      feeCurrency: tx.fee_currency
    });

    for (const secondary of secondaryDeltas) {
      const symbol = secondary.symbol.toUpperCase();
      if (!symbol) continue;
      let delta = Number(secondary.delta || 0);
      if (secondary.source === "quote") {
        delta = resolveQuoteDeltaFromStored(tx);
      }
      if (!Number.isFinite(delta) || delta === 0) {
        continue;
      }

      const currentQty = Number(accountBalances.get(symbol) || 0);
      if (delta < 0 && currentQty < Math.abs(delta)) {
        continue;
      }

      const meta = assetsMetaBySymbol.get(symbol);
      expandedRows.push({
        id: syntheticId--,
        datetime: tx.datetime,
        type: (delta >= 0 ? "DEPOSIT" : "WITHDRAW") as TransactionType,
        account_id: tx.account_id,
        account_name: tx.account_name,
        account_base_currency: tx.account_base_currency,
        asset_symbol: symbol,
        quote_asset_symbol: null,
        quantity: Math.abs(delta),
        price: 1,
        gross_proceeds: null,
        net_proceeds: null,
        fee_amount: 0,
        fee_currency: null,
        asset_name: meta?.name || symbol,
        asset_type: (meta?.type as "crypto" | "stock" | null) || "crypto",
        asset_class: (meta?.asset_class as "crypto" | "stock" | null) || "crypto",
        last_price: Number(meta?.last_price ?? 1),
        last_price_updated_at: meta?.last_price_updated_at || null,
        asset_updated_at: meta?.asset_updated_at || null,
        provider_id: meta?.provider_id || null,
        coingecko_id: meta?.coingecko_id || null,
        synthetic: true
      });
      accountBalances.set(symbol, Math.max(0, currentQty + delta));
    }
    balancesByAccount.set(accountId, accountBalances);
  }

  const txByGroup = new Map<string, TxRow[]>();
  const metadataByGroup = new Map<
    string,
      {
        symbol: string;
        name: string;
        asset_class: AssetClass;
        last_price: number;
      price_updated_at: string | null;
      updated_at: string | null;
      provider_id: string | null;
      coingecko_id: string | null;
      account_id: number | null;
      account_name: string | null;
    }
  >();

  for (const tx of expandedRows as TxRow[]) {
    const accountKey = tx.account_id ?? 0;
    const key = `${tx.asset_symbol}:${accountKey}`;
    const list = txByGroup.get(key) || [];
    list.push(tx);
    txByGroup.set(key, list);

    const txWithMeta = tx as TxRowWithAssetMeta;
    if (!metadataByGroup.has(key)) {
      metadataByGroup.set(key, {
        symbol: tx.asset_symbol,
        name: txWithMeta.asset_name || tx.asset_symbol,
        asset_class: normalizeAssetClass(txWithMeta.asset_class ?? txWithMeta.asset_type ?? "crypto"),
        last_price: Number(txWithMeta.last_price || 0),
        price_updated_at: txWithMeta.last_price_updated_at || txWithMeta.asset_updated_at || null,
        updated_at: txWithMeta.asset_updated_at || null,
        provider_id: txWithMeta.provider_id || null,
        coingecko_id: txWithMeta.coingecko_id || null,
        account_id: tx.account_id,
        account_name: tx.account_name
      });
    }
  }

  return Array.from(txByGroup.entries())
    .map(([key, assetTxs]) => {
      const meta = metadataByGroup.get(key);
      if (!meta) {
        return null;
      }

      const metrics = calculateAssetPortfolio(assetTxs, Number(meta.last_price));
      const ownedQty = metrics.qty;
      const marketValue = ownedQty * Number(meta.last_price);
      const accounts = meta.account_name ? [meta.account_name] : [];
      const accountsCount = accounts.length;

      return {
        key,
        symbol: meta.symbol,
        name: meta.name,
        type: meta.asset_class,
        asset_class: meta.asset_class,
        account_id: meta.account_id,
        account_name: meta.account_name,
        last_price: Number(meta.last_price),
        price_updated_at: meta.price_updated_at,
        updated_at: meta.updated_at,
        noLivePrice: !isAssetLivePriceSupported(
          meta.asset_class,
          meta.symbol,
          (meta.coingecko_id ?? meta.provider_id) || undefined
        ),
        accounts,
        accountsCount,
        ownedQty,
        avgCost: metrics.avgCost,
        marketValue,
        realizedPnL: metrics.realizedPnL,
        unrealizedPnL: metrics.unrealized,
        totalPnL: metrics.totalPnL,
        txCount: assetTxs.filter((tx) => !tx.synthetic).length
      };
    })
    .filter((row): row is HoldingWithStats => Boolean(row))
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || (a.account_name || "").localeCompare(b.account_name || ""));
}

import { pool } from "@/lib/db";
import { calculateAssetPortfolio } from "@/lib/portfolio";
import { isAssetLivePriceSupported } from "@/lib/prices";
import type { TransactionType } from "@/lib/types";

export interface HoldingWithStats {
  key: string;
  symbol: string;
  name: string;
  type: "crypto" | "stock";
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
  quantity: number;
  price: number;
  fee_amount: number;
  account_name: string | null;
}

interface TxRowWithAssetMeta extends TxRow {
  asset_name?: string | null;
  asset_type?: "crypto" | "stock" | null;
  last_price?: number | null;
  last_price_updated_at?: string | null;
  asset_updated_at?: string | null;
  provider_id?: string | null;
  coingecko_id?: string | null;
}

export async function getHoldingsWithStats(): Promise<HoldingWithStats[]> {
  let txResult;
  try {
    txResult = await pool.query(
      `SELECT
         t.id,
         t.datetime,
         t.type,
         t.account_id,
         t.asset_symbol,
         t.quantity,
         t.price,
         t.fee_amount,
         a.name AS account_name,
         ass.name AS asset_name,
         ass.type AS asset_type,
         ass.last_price AS last_price,
         ass.updated_at AS asset_updated_at,
         ass.provider_id AS provider_id,
         ass.coingecko_id AS coingecko_id,
         ass.last_price_updated_at AS last_price_updated_at
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       LEFT JOIN assets ass ON ass.symbol = t.asset_symbol
       ORDER BY t.datetime ASC, t.id ASC`
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
           t.quantity,
           t.price,
           t.fee_amount,
           a.name AS account_name,
           ass.name AS asset_name,
           ass.type AS asset_type,
           ass.last_price AS last_price,
           ass.updated_at AS asset_updated_at,
           ass.provider_id AS provider_id
         FROM transactions t
         LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN assets ass ON ass.symbol = t.asset_symbol
         ORDER BY t.datetime ASC, t.id ASC`
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
           t.quantity,
           t.price,
           t.fee_amount,
           a.name AS account_name,
           ass.name AS asset_name,
           ass.type AS asset_type,
           ass.last_price AS last_price,
           ass.updated_at AS asset_updated_at
         FROM transactions t
         LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN assets ass ON ass.symbol = t.asset_symbol
         ORDER BY t.datetime ASC, t.id ASC`
      );
    }
  }

  const txByGroup = new Map<string, TxRow[]>();
  const metadataByGroup = new Map<
    string,
    {
      symbol: string;
      name: string;
      type: "crypto" | "stock";
      last_price: number;
      price_updated_at: string | null;
      updated_at: string | null;
      provider_id: string | null;
      coingecko_id: string | null;
      account_id: number | null;
      account_name: string | null;
    }
  >();

  for (const tx of txResult.rows as TxRow[]) {
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
        type: (txWithMeta.asset_type as "crypto" | "stock") || "crypto",
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

      const buySellTxs = assetTxs.filter((tx) => tx.type === "BUY" || tx.type === "SELL");
      const depositQty = assetTxs
        .filter((tx) => tx.type === "DEPOSIT")
        .reduce((sum, tx) => sum + Number(tx.quantity || 0), 0);
      const withdrawQty = assetTxs
        .filter((tx) => tx.type === "WITHDRAW")
        .reduce((sum, tx) => sum + Number(tx.quantity || 0), 0);
      const feeQty = assetTxs
        .filter((tx) => tx.type === "FEE")
        .reduce((sum, tx) => sum + Number(tx.quantity || 0), 0);

      const metrics = calculateAssetPortfolio(buySellTxs, Number(meta.last_price));
      const ownedQty = metrics.qty + depositQty - withdrawQty - feeQty;
      const marketValue = ownedQty * Number(meta.last_price);
      const accounts = meta.account_name ? [meta.account_name] : [];
      const accountsCount = accounts.length;

      return {
        key,
        symbol: meta.symbol,
        name: meta.name,
        type: meta.type,
        account_id: meta.account_id,
        account_name: meta.account_name,
        last_price: Number(meta.last_price),
        price_updated_at: meta.price_updated_at,
        updated_at: meta.updated_at,
        noLivePrice: !isAssetLivePriceSupported(
          meta.type,
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
        txCount: assetTxs.length
      };
    })
    .filter((row): row is HoldingWithStats => Boolean(row))
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || (a.account_name || "").localeCompare(b.account_name || ""));
}

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { normalizeAssetClass } from "@/lib/asset-class";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";
import { requireUserId, UnauthorizedError } from "@/lib/requireUser";
import { computeHoldingDelta, computeSecondaryAssetDeltas, resolveFeeModel } from "@/lib/transaction-math";

export const dynamic = "force-dynamic";

interface AccountRow {
  id: number;
  name: string;
  kind: string;
  base_currency: string;
  is_default: boolean;
}

interface TxRow {
  id: number;
  account_id: number;
  symbol: string;
  quote_asset_symbol: string | null;
  type: string;
  quantity: number;
  price: number;
  gross_proceeds: number | null;
  net_proceeds: number | null;
  fee_amount: number;
  fee_currency: string | null;
  account_base_currency: string | null;
  datetime: string;
  name: string | null;
  asset_type: string | null;
  last_price: number | null;
}

function resolveQuoteDeltaFromStored(row: Pick<TxRow, "type" | "quantity" | "price" | "gross_proceeds" | "net_proceeds">) {
  const gross = Number(row.gross_proceeds ?? row.quantity * row.price);
  const net = Number(row.net_proceeds ?? gross);
  const type = String(row.type || "").toUpperCase();
  if (type === "BUY") {
    return -Math.max(0, net);
  }
  if (type === "SELL") {
    return Math.max(0, net || gross);
  }
  return 0;
}

interface AssetMetaRow {
  symbol: string;
  name: string | null;
  type: string | null;
  last_price: number | null;
}

interface HoldingAccumulator {
  symbol: string;
  name: string;
  assetType: string | null;
  qty: number;
  costBasis: number;
  lastPrice: number | null;
}

const CASH_LIKE_SYMBOLS = new Set(["USD", "USDT", "USDC", "FDUSD", "BUSD", "DAI", "TUSD", "USDP"]);

function fallbackUsdPrice(symbol: string, lastPrice: number | null | undefined) {
  if (Number.isFinite(lastPrice) && Number(lastPrice) > 0) {
    return Number(lastPrice);
  }
  return CASH_LIKE_SYMBOLS.has(String(symbol || "").toUpperCase()) ? 1 : null;
}

function roundMoney(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(2));
}

function roundQty(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(8));
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit({ key: `accounts:summary:${userId}:${ip}`, limit: 120, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const includeHoldings = searchParams.get("includeHoldings") === "1";
  try {
    const transactionsPromise = pool
      .query<TxRow>(
        `SELECT
           t.id,
           t.account_id,
           t.asset_symbol AS symbol,
           t.quote_asset_symbol,
           t.type,
           t.quantity,
           t.price,
           t.gross_proceeds,
           t.net_proceeds,
           COALESCE(t.fee_amount, 0) AS fee_amount,
           t.fee_currency,
           acc.base_currency AS account_base_currency,
           t.datetime,
           a.name,
           a.type AS asset_type,
           a.last_price
         FROM transactions t
         LEFT JOIN accounts acc ON acc.id = t.account_id
         LEFT JOIN assets a ON a.symbol = t.asset_symbol
         WHERE t.user_id = $1
         ORDER BY t.account_id ASC, t.datetime ASC, t.id ASC`,
        [userId]
      )
      .catch(async (error) => {
        if ((error as { code?: string }).code !== "42703") {
          throw error;
        }
        return pool.query<TxRow>(
          `SELECT
             t.id,
             t.account_id,
             t.asset_symbol AS symbol,
             NULL::text AS quote_asset_symbol,
             t.type,
             t.quantity,
             t.price,
             NULL::double precision AS gross_proceeds,
             NULL::double precision AS net_proceeds,
             COALESCE(t.fee_amount, 0) AS fee_amount,
             t.fee_currency,
             acc.base_currency AS account_base_currency,
             t.datetime,
             a.name,
             a.type AS asset_type,
             a.last_price
           FROM transactions t
           LEFT JOIN accounts acc ON acc.id = t.account_id
           LEFT JOIN assets a ON a.symbol = t.asset_symbol
           WHERE t.user_id = $1
           ORDER BY t.account_id ASC, t.datetime ASC, t.id ASC`,
          [userId]
        );
      });

    const [accountsResult, transactionsResult, assetsMetaResult] = await Promise.all([
      pool.query<AccountRow>(
      `SELECT
         id,
         name,
         CASE
           WHEN kind IN ('exchange', 'fiat') THEN kind
           WHEN kind = 'FIAT_CASH' THEN 'fiat'
           ELSE 'exchange'
         END AS kind,
         base_currency,
         COALESCE(is_default, false) AS is_default
       FROM accounts
       WHERE user_id = $1
       ORDER BY is_default DESC, name ASC`
      ,
      [userId]
    ),
      transactionsPromise,
      pool.query<AssetMetaRow>(
        `SELECT symbol, name, type, last_price
         FROM assets`
      )
    ]);
    const assetsMetaBySymbol = new Map<string, AssetMetaRow>();
    for (const row of assetsMetaResult.rows) {
      assetsMetaBySymbol.set(row.symbol.toUpperCase(), row);
    }

    const accountAssetAcc = new Map<number, Map<string, HoldingAccumulator>>();

    for (const row of transactionsResult.rows) {
    const accountId = Number(row.account_id);
    const symbol = String(row.symbol || "").toUpperCase();
    if (!accountId || !symbol) {
      continue;
    }

    const qty = Number(row.quantity || 0);
    const price = Number(row.price || 0);
    const fee = Number(row.fee_amount || 0);
    const type = String(row.type || "").toUpperCase();
    const baseCurrency = row.account_base_currency || "USD";
    const quoteOrBase = row.quote_asset_symbol || baseCurrency;
    const feeModel = resolveFeeModel({
      assetSymbol: symbol,
      feeCurrency: row.fee_currency,
      baseCurrency: quoteOrBase
    });

    const perAccount = accountAssetAcc.get(accountId) || new Map<string, HoldingAccumulator>();
    const current = perAccount.get(symbol) || {
      symbol,
      name: row.name || symbol,
      assetType: row.asset_type,
      qty: 0,
      costBasis: 0,
      lastPrice: fallbackUsdPrice(symbol, row.last_price == null ? null : Number(row.last_price))
    };

    current.name = row.name || current.name || symbol;
    current.assetType = row.asset_type || current.assetType;
    current.lastPrice = fallbackUsdPrice(symbol, row.last_price == null ? current.lastPrice : Number(row.last_price));

    if (type === "BUY" || type === "DEPOSIT") {
      const delta = computeHoldingDelta({
        type,
        assetSymbol: symbol,
        quantity: qty,
        feeAmount: fee,
        feeCurrency: row.fee_currency,
        baseCurrency: quoteOrBase
      });
      current.qty += Math.max(0, delta);
      const baseFee = feeModel === "base" ? fee : 0;
      current.costBasis += qty * price + baseFee;
    } else if (type === "SELL" || type === "WITHDRAW" || type === "FEE") {
      if (current.qty > 0) {
        const avgCostBefore = current.costBasis / current.qty;
        const reductionRequested = Math.abs(
          computeHoldingDelta({
            type,
            assetSymbol: symbol,
            quantity: qty,
            feeAmount: fee,
            feeCurrency: row.fee_currency,
            baseCurrency: quoteOrBase
          })
        );
        const reducedQty = Math.min(reductionRequested, current.qty);
        current.costBasis -= reducedQty * avgCostBefore;
        current.qty -= reducedQty;
      }
    }

    if (current.qty <= 1e-12) {
      current.qty = 0;
      current.costBasis = 0;
    }

    perAccount.set(symbol, current);

    const secondaryDeltas = computeSecondaryAssetDeltas({
      type,
      assetSymbol: symbol,
      quoteAssetSymbol: row.quote_asset_symbol || baseCurrency,
      quantity: qty,
      price,
      feeAmount: fee,
      feeCurrency: row.fee_currency
    });
    for (const secondary of secondaryDeltas) {
      const secondarySymbol = secondary.symbol.toUpperCase();
      if (!secondarySymbol) continue;
      let secondaryDelta = Number(secondary.delta || 0);
      if (secondary.source === "quote") {
        secondaryDelta = resolveQuoteDeltaFromStored(row);
      }
      const existingSecondary = perAccount.get(secondarySymbol);
      const existingQty = Number(existingSecondary?.qty || 0);

      // Conversion tracker rule:
      // apply negative movement only if full balance exists; never create/leave negative quote balances.
      if (secondaryDelta < 0 && existingQty < Math.abs(secondaryDelta)) {
        continue;
      }

      const meta = assetsMetaBySymbol.get(secondarySymbol);
      const secondaryCurrent = existingSecondary || {
        symbol: secondarySymbol,
        name: meta?.name || secondarySymbol,
        assetType: meta?.type || "crypto",
        qty: 0,
        costBasis: 0,
        lastPrice: fallbackUsdPrice(secondarySymbol, meta?.last_price == null ? null : Number(meta.last_price))
      };
      const secondaryPriceUsd = fallbackUsdPrice(
        secondarySymbol,
        meta?.last_price == null ? secondaryCurrent.lastPrice : Number(meta.last_price)
      );

      if (secondaryDelta > 0) {
        secondaryCurrent.qty += secondaryDelta;
        if (secondaryPriceUsd != null) {
          secondaryCurrent.costBasis += secondaryDelta * secondaryPriceUsd;
        }
      } else if (secondaryDelta < 0) {
        const reducible = Math.abs(secondaryDelta);
        const avgCostBefore = secondaryCurrent.qty > 0 ? secondaryCurrent.costBasis / secondaryCurrent.qty : 0;
        secondaryCurrent.qty -= reducible;
        if (avgCostBefore > 0) {
          secondaryCurrent.costBasis -= reducible * avgCostBefore;
        }
      }

      if (Math.abs(secondaryCurrent.qty) <= 1e-12 || secondaryCurrent.qty < 0) {
        secondaryCurrent.qty = 0;
      }
      if (secondaryCurrent.qty === 0 || Math.abs(secondaryCurrent.costBasis) <= 1e-12) {
        secondaryCurrent.costBasis = 0;
      }

      perAccount.set(secondarySymbol, secondaryCurrent);
    }

    accountAssetAcc.set(accountId, perAccount);
    }

    const accounts = accountsResult.rows.map((account) => {
    const holdingsAcc = Array.from(accountAssetAcc.get(account.id)?.values() || []).filter((item) => item.qty > 0);

    const holdings = holdingsAcc
      .map((item) => {
        const avgCost = item.qty > 0 ? item.costBasis / item.qty : 0;
        const cost = item.qty * avgCost;
        const hasLivePrice = Number.isFinite(item.lastPrice) && Number(item.lastPrice) > 0;
        const worthLive = hasLivePrice ? item.qty * Number(item.lastPrice) : null;
        let pnl: number | null = null;
        let pnlPct: number | null = null;
        if (worthLive !== null) {
          pnl = worthLive - cost;
          pnlPct = cost > 0 ? (pnl / cost) * 100 : null;
        }

        return {
          symbol: item.symbol,
          name: item.name,
          assetClass: normalizeAssetClass(item.assetType),
          qty: roundQty(item.qty),
          avgCost: roundMoney(avgCost),
          cost: roundMoney(cost),
          lastPriceUsd: hasLivePrice ? roundMoney(Number(item.lastPrice)) : null,
          worthLive: worthLive === null ? null : roundMoney(worthLive),
          pnl: pnl === null ? null : roundMoney(pnl),
          pnlPct: pnlPct === null ? null : Number(pnlPct.toFixed(2))
        };
      })
      .sort((a, b) => {
        const aWorth = a.worthLive ?? -1;
        const bWorth = b.worthLive ?? -1;
        return bWorth - aWorth;
      });

    const missingLivePrice = holdings.some((item) => item.worthLive === null);
    const totalCost = holdings.reduce((sum, item) => sum + Number(item.cost || 0), 0);
    const totalWorth = missingLivePrice ? null : holdings.reduce((sum, item) => sum + Number(item.worthLive || 0), 0);
    let totalPnl: number | null = null;
    let totalPnlPct: number | null = null;
    if (totalWorth !== null) {
      totalPnl = totalWorth - totalCost;
      totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : null;
    }

    const holdingsCount = holdings.length;
    const topHoldings = holdings.slice(0, 3).map((item) => ({
      symbol: item.symbol,
      name: item.name,
      qty: item.qty,
      worthLive: item.worthLive,
      cost: item.cost
    }));

    return {
      accountId: account.id,
      name: account.name,
      kind: account.kind,
      baseCurrency: account.base_currency,
      isDefault: account.is_default,
      costTotal: roundMoney(totalCost),
      worthTotal: totalWorth === null ? null : roundMoney(totalWorth),
      pnlTotal: totalPnl === null ? null : roundMoney(totalPnl),
      pnlPctTotal: totalPnlPct === null ? null : Number(totalPnlPct.toFixed(2)),
      holdingsCount,
      topHoldings,
      ...(includeHoldings
        ? {
          holdings
        }
        : {})
    };
    });

    return NextResponse.json(
      { accounts },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("[api/accounts/summary][GET] error", error);
    return NextResponse.json({ error: "Could not load account summary" }, { status: 500 });
  }
}

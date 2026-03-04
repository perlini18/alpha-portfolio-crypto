import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

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
  type: string;
  quantity: number;
  price: number;
  fee_amount: number;
  datetime: string;
  name: string | null;
  last_price: number | null;
}

interface HoldingAccumulator {
  symbol: string;
  name: string;
  qty: number;
  costBasis: number;
  lastPrice: number | null;
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
  const { searchParams } = new URL(request.url);
  const includeHoldings = searchParams.get("includeHoldings") === "1";

  const [accountsResult, transactionsResult] = await Promise.all([
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
       ORDER BY is_default DESC, name ASC`
    ),
    pool.query<TxRow>(
      `SELECT
         t.id,
         t.account_id,
         t.asset_symbol AS symbol,
         t.type,
         t.quantity,
         t.price,
         COALESCE(t.fee_amount, 0) AS fee_amount,
         t.datetime,
         a.name,
         a.last_price
       FROM transactions t
       LEFT JOIN assets a ON a.symbol = t.asset_symbol
       ORDER BY t.account_id ASC, t.asset_symbol ASC, t.datetime ASC, t.id ASC`
    )
  ]);

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

    const perAccount = accountAssetAcc.get(accountId) || new Map<string, HoldingAccumulator>();
    const current = perAccount.get(symbol) || {
      symbol,
      name: row.name || symbol,
      qty: 0,
      costBasis: 0,
      lastPrice: row.last_price == null ? null : Number(row.last_price)
    };

    current.name = row.name || current.name || symbol;
    current.lastPrice = row.last_price == null ? current.lastPrice : Number(row.last_price);

    if (type === "BUY" || type === "DEPOSIT") {
      current.costBasis += qty * price + fee;
      current.qty += qty;
    } else if (type === "SELL" || type === "WITHDRAW" || type === "FEE") {
      if (current.qty > 0) {
        const avgCostBefore = current.costBasis / current.qty;
        const soldQty = Math.min(qty, current.qty);
        current.costBasis -= soldQty * avgCostBefore;
        current.qty -= soldQty;
      }
    }

    if (current.qty <= 1e-12) {
      current.qty = 0;
      current.costBasis = 0;
    }

    perAccount.set(symbol, current);
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
}

import type { PortfolioMetrics, Transaction } from "@/lib/types";
import { computeHoldingDelta, resolveFeeModel } from "@/lib/transaction-math";

export function calculateAssetPortfolio(
  transactions: Array<
    Pick<
      Transaction,
      "datetime" | "type" | "quantity" | "price" | "fee_amount" | "fee_currency" | "asset_symbol" | "quote_asset_symbol"
    > & { account_base_currency?: string | null }
  >,
  lastPrice: number
): PortfolioMetrics {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
  );

  let qty = 0;
  let costBasis = 0;
  let realizedPnL = 0;

  for (const tx of sorted) {
    const quoteOrBase = tx.quote_asset_symbol || tx.account_base_currency || "USD";
    const feeModel = resolveFeeModel({
      assetSymbol: tx.asset_symbol,
      feeCurrency: tx.fee_currency,
      baseCurrency: quoteOrBase
    });

    if (tx.type === "BUY") {
      const delta = computeHoldingDelta({
        type: tx.type,
        assetSymbol: tx.asset_symbol,
        quantity: tx.quantity,
        feeAmount: tx.fee_amount,
        feeCurrency: tx.fee_currency,
        baseCurrency: quoteOrBase
      });

      qty += delta;
      const baseFee = feeModel === "base" ? tx.fee_amount : 0;
      costBasis += tx.quantity * tx.price + baseFee;
      continue;
    }

    if (tx.type === "SELL") {
      if (qty <= 0) {
        continue;
      }

      const requestedSellQty = Math.max(0, tx.quantity);
      const reductionRequested = Math.abs(
        computeHoldingDelta({
          type: tx.type,
          assetSymbol: tx.asset_symbol,
          quantity: tx.quantity,
          feeAmount: tx.fee_amount,
          feeCurrency: tx.fee_currency,
          baseCurrency: quoteOrBase
        })
      );

      const sellQty = Math.min(requestedSellQty, qty);
      const reduction = Math.min(reductionRequested, qty);
      const avgCost = costBasis / qty;
      const feeShare =
        feeModel === "base" && requestedSellQty > 0 ? tx.fee_amount * (sellQty / requestedSellQty) : 0;
      const proceeds = sellQty * tx.price - feeShare;
      realizedPnL += proceeds - avgCost * reduction;
      costBasis -= avgCost * reduction;
      qty -= reduction;
      continue;
    }

    if (tx.type === "DEPOSIT" || tx.type === "WITHDRAW" || tx.type === "FEE") {
      const delta = computeHoldingDelta({
        type: tx.type,
        assetSymbol: tx.asset_symbol,
        quantity: tx.quantity,
        feeAmount: tx.fee_amount,
        feeCurrency: tx.fee_currency,
        baseCurrency: quoteOrBase
      });
      if (delta > 0) {
        qty += delta;
      } else if (delta < 0 && qty > 0) {
        const reduction = Math.min(Math.abs(delta), qty);
        const avgCost = costBasis / qty;
        costBasis -= avgCost * reduction;
        qty -= reduction;
      }
    }
  }

  const avgCostFinal = qty > 0 ? costBasis / qty : 0;
  const unrealized = (lastPrice - avgCostFinal) * qty;
  const marketValue = qty * lastPrice;

  return {
    qty,
    avgCost: avgCostFinal,
    realizedPnL,
    unrealized,
    marketValue,
    totalPnL: realizedPnL + unrealized
  };
}

import type { PortfolioMetrics, Transaction } from "@/lib/types";

export function calculateAssetPortfolio(
  transactions: Pick<Transaction, "datetime" | "type" | "quantity" | "price" | "fee_amount">[],
  lastPrice: number
): PortfolioMetrics {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
  );

  let qty = 0;
  let costBasis = 0;
  let realizedPnL = 0;

  for (const tx of sorted) {
    if (tx.type === "BUY") {
      qty += tx.quantity;
      costBasis += tx.quantity * tx.price + tx.fee_amount;
      continue;
    }

    if (tx.type === "SELL") {
      if (qty <= 0) {
        continue;
      }

      const sellQty = Math.min(tx.quantity, qty);
      const avgCost = costBasis / qty;
      realizedPnL += (tx.price - avgCost) * sellQty - tx.fee_amount;
      costBasis -= avgCost * sellQty;
      qty -= sellQty;
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

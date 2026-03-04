import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { calculateAssetPortfolio } from "@/lib/portfolio";
import { formatMoney, formatNumber } from "@/lib/format";

interface Props {
  params: {
    symbol: string;
  };
}

export default async function AssetDetailPage({ params }: Props) {
  const symbol = params.symbol.toUpperCase();

  const assetRes = await pool.query(
    "SELECT symbol, name, type, last_price FROM assets WHERE symbol = $1",
    [symbol]
  );

  if (!assetRes.rows[0]) {
    notFound();
  }

  const txRes = await pool.query(
    `SELECT id, datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes
     FROM transactions
     WHERE asset_symbol = $1
     ORDER BY datetime DESC, id DESC`,
    [symbol]
  );

  const portfolio = calculateAssetPortfolio(
    txRes.rows.filter((tx) => tx.type === "BUY" || tx.type === "SELL"),
    Number(assetRes.rows[0].last_price)
  );

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{symbol}</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="card">
          <div className="text-sm text-slate-500">Owned</div>
          <div className="mt-2 text-2xl font-semibold">{formatNumber(portfolio.qty)}</div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-500">Market Value</div>
          <div className="mt-2 text-2xl font-semibold">{formatMoney(portfolio.marketValue)}</div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-500">Total Gain/Loss</div>
          <div className={`mt-2 text-2xl font-semibold ${portfolio.totalPnL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {formatMoney(portfolio.totalPnL)}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-500">Avg Buy</div>
          <div className="mt-2 text-2xl font-semibold">{formatMoney(portfolio.avgCost)}</div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="mb-3 text-lg font-semibold">Transactions</div>
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="table-cell">Datetime</th>
              <th className="table-cell">Type</th>
              <th className="table-cell">Qty</th>
              <th className="table-cell">Price</th>
              <th className="table-cell">Fee</th>
              <th className="table-cell">Notes</th>
            </tr>
          </thead>
          <tbody>
            {txRes.rows.map((tx) => (
              <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                <td className="table-cell">{new Date(tx.datetime).toLocaleString()}</td>
                <td className="table-cell">
                  <span className={`badge ${tx.type === "BUY" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {tx.type}
                  </span>
                </td>
                <td className="table-cell">{formatNumber(Number(tx.quantity))}</td>
                <td className="table-cell">{formatMoney(Number(tx.price))}</td>
                <td className="table-cell">{formatMoney(Number(tx.fee_amount || 0))}</td>
                <td className="table-cell text-slate-500">{tx.notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

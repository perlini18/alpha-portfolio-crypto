"use client";

import Link from "next/link";
import { formatMoney, formatNumber } from "@/lib/format";
import { AssetIcon } from "@/components/AssetIcon";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";

export interface DashboardHoldingRow {
  symbol: string;
  name: string;
  type: "crypto" | "stock";
  owned: number;
  market_value: number;
  pnl: number;
  last_price: number;
  updated_at: string | null;
  tx_count: number;
  account?: string | null;
}

interface HoldingsTableProps {
  rows: DashboardHoldingRow[];
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function HoldingsTable({ rows }: HoldingsTableProps) {
  const { lang } = useLanguage();

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const totalCostBasis = row.market_value - row.pnl;
        const pnlPercent = totalCostBasis !== 0 ? (row.pnl / totalCostBasis) * 100 : null;
        const subtitle = `${row.name}${row.account ? ` • ${row.account}` : ""}`;

        return (
          <article
            key={`${row.symbol}:${row.account || "global"}`}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/assets/${row.symbol}`} className="inline-flex items-center gap-3">
                <AssetIcon symbol={row.symbol} />
                <span>
                  <span className="block text-sm font-bold text-[color:var(--ink-900)]">{row.symbol}</span>
                  <span className="block text-xs text-[color:var(--muted)]">{subtitle}</span>
                </span>
              </Link>

              <div className="grid grid-cols-3 gap-4 text-left sm:text-right">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">{t("dashboard.holdings", lang)}</p>
                  <p className="text-sm font-semibold text-[color:var(--ink-900)]">{formatNumber(row.owned)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">{t("accounts.value", lang)}</p>
                  <p className="text-sm font-semibold text-[color:var(--ink-900)]">{formatMoney(row.market_value)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[color:var(--muted)]">{t("dashboard.totalPnl", lang)}</p>
                  <p className={`text-sm font-semibold ${Number(row.pnl) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {formatPercent(pnlPercent)}
                  </p>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

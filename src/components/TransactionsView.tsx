"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney, formatNumber } from "@/lib/format";
import { NewTransactionModal } from "@/components/NewTransactionModal";
import { TransactionRowActions } from "@/components/TransactionRowActions";
import { AdsCarousel } from "@/components/AdsCarousel";
import { AssetIcon } from "@/components/AssetIcon";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { usePrices } from "@/lib/prices-store";

interface TransactionsViewProps {
  transactions: Array<{
    id: number;
    datetime: string;
    type: string;
    account_id: number;
    asset_symbol: string;
    quantity: number;
    price: number;
    fee_amount: number;
    fee_currency: string | null;
    notes: string | null;
  }>;
  accounts: Array<{ id?: number; name: string; kind?: string; is_default?: boolean }>;
  assets: Array<{ symbol?: string; name: string; type?: "crypto" | "stock"; [key: string]: unknown }>;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC"
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC"
});

function formatDateTimeUtc(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

function formatDateUtc(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function TransactionsView({ transactions, accounts, assets }: TransactionsViewProps) {
  const { lang } = useLanguage();
  const { pricesMap, loadOnce, refresh, status, lastUpdated } = usePrices();
  const accountNameById = new Map(accounts.map((account) => [Number(account.id), account.name]));

  useEffect(() => {
    void loadOnce();
  }, []);

  const normalizedPriceBySymbol = useMemo(() => {
    const next: Record<string, number> = {};
    for (const [symbol, value] of Object.entries(pricesMap)) {
      next[symbol.toUpperCase()] = value;
    }
    return next;
  }, [pricesMap]);

  return (
    <section className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[color:var(--ink-900)]">{t("transactions.title", lang)}</h1>
          <p className="text-sm text-[color:var(--muted)]">{t("transactions.subtitle", lang)}</p>
          <p className="text-xs text-[color:var(--muted)]">
            {lastUpdated ? `Updated ${Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000))}s ago` : "Updated —"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void fetch("/api/prices/refresh?force=1", { cache: "no-store" })
                .catch(() => null)
                .finally(() => {
                  void refresh(true);
                });
            }}
            disabled={status === "loading"}
            className="btn-secondary disabled:opacity-60"
          >
            {status === "loading" ? t("dashboard.refreshing", lang) : t("dashboard.refresh", lang)}
          </button>
          <NewTransactionModal accounts={accounts} assets={assets} />
        </div>
      </div>

      <AdsCarousel page="transactions" />

      <div className="space-y-3 md:hidden">
        {transactions.map((tx) => {
          const qty = Number(tx.quantity);
          const price = Number(tx.price);
          const fee = Number(tx.fee_amount || 0);
          const marketPrice = normalizedPriceBySymbol[String(tx.asset_symbol).toUpperCase()];
          const worth = Number.isFinite(marketPrice) && marketPrice > 0 ? qty * marketPrice : null;
          const isBuy = tx.type === "BUY";
          const fallbackCost = qty * price + fee;
          return (
            <article key={`mobile-tx-${tx.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AssetIcon symbol={tx.asset_symbol} />
                  <div className="space-y-1">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        isBuy
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {tx.type}
                    </span>
                    <p className="text-sm font-semibold text-slate-900">{tx.asset_symbol}</p>
                    <p className="text-xs text-slate-500">
                      {accountNameById.get(tx.account_id) || `#${tx.account_id}`}
                    </p>
                  </div>
                </div>
                <TransactionRowActions
                  transaction={{
                    id: tx.id,
                    datetime: tx.datetime,
                    type: tx.type,
                    account_id: tx.account_id,
                    asset_symbol: tx.asset_symbol,
                    quantity: Number(tx.quantity),
                    price: Number(tx.price),
                    fee_amount: Number(tx.fee_amount || 0),
                    fee_currency: tx.fee_currency,
                    notes: tx.notes
                  }}
                  accounts={accounts}
                  assets={assets}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-500">{t("accounts.qty", lang)}</p>
                  <p className="font-semibold text-slate-900">{formatNumber(Number(tx.quantity))}</p>
                </div>
                <div>
                  <p className="text-slate-500">{t("transactions.price", lang)}</p>
                  <p className="font-semibold text-slate-900">{formatMoney(Number(tx.price))}</p>
                </div>
                <div>
                  <p className="text-slate-500">{t("transactions.cost", lang)}</p>
                  <p className="font-semibold text-slate-900">
                    {fallbackCost.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">{t("transactions.worth", lang)} (Live)</p>
                  {worth !== null ? (
                    <p className="font-semibold text-slate-900">
                      {worth.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </p>
                  ) : (
                    <>
                      <p className="font-semibold text-slate-900">—</p>
                      <p className="text-[11px] text-slate-500">No live price</p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-slate-500">{t("transactions.datetime", lang)}</p>
                  <p className="font-semibold text-slate-900">{formatDateUtc(tx.datetime)}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="card hidden overflow-x-auto md:block">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="table-cell">{t("transactions.datetime", lang)}</th>
              <th className="table-cell">{t("transactions.type", lang)}</th>
              <th className="table-cell">{t("transactions.asset", lang)}</th>
              <th className="table-cell">{t("transactions.account", lang)}</th>
              <th className="table-cell text-right">{t("accounts.qty", lang)}</th>
              <th className="table-cell text-right">{t("transactions.price", lang)}</th>
              <th className="table-cell text-right">{t("transactions.cost", lang)}</th>
              <th className="table-cell text-right">{t("transactions.worth", lang)} (Live)</th>
              <th className="table-cell text-right">{t("transactions.fee", lang)}</th>
              <th className="table-cell">{t("transactions.notes", lang)}</th>
              <th className="table-cell">{t("transactions.actions", lang)}</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => {
              const qty = Number(tx.quantity);
              const price = Number(tx.price);
              const fee = Number(tx.fee_amount || 0);
              const cost = qty * price + fee;
              const marketPrice = normalizedPriceBySymbol[String(tx.asset_symbol).toUpperCase()];
              const worth = Number.isFinite(marketPrice) && marketPrice > 0 ? qty * marketPrice : null;
              return (
                <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                  <td className="table-cell">{formatDateTimeUtc(tx.datetime)}</td>
                  <td className="table-cell">{tx.type}</td>
                  <td className="table-cell">
                    <div className="inline-flex items-center gap-2">
                      <AssetIcon symbol={tx.asset_symbol} size={24} />
                      <span className="font-semibold">{tx.asset_symbol}</span>
                    </div>
                  </td>
                  <td className="table-cell">{accountNameById.get(tx.account_id) || tx.account_id}</td>
                  <td className="table-cell text-right tabular-nums">{formatNumber(qty)}</td>
                  <td className="table-cell text-right tabular-nums">{formatMoney(price)}</td>
                  <td className="table-cell text-right tabular-nums">
                    {cost.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </td>
                  <td className="table-cell text-right tabular-nums">
                    {worth !== null ? (
                      worth.toLocaleString("en-US", { style: "currency", currency: "USD" })
                    ) : (
                      <span title="No live price" className="text-slate-500">
                        —
                      </span>
                    )}
                  </td>
                  <td className="table-cell text-right tabular-nums">{formatMoney(fee)}</td>
                  <td className="table-cell text-slate-500">{tx.notes || "-"}</td>
                  <td className="table-cell">
                    <TransactionRowActions
                      transaction={{
                        id: tx.id,
                        datetime: tx.datetime,
                        type: tx.type,
                        account_id: tx.account_id,
                        asset_symbol: tx.asset_symbol,
                        quantity: qty,
                        price,
                        fee_amount: fee,
                        fee_currency: tx.fee_currency,
                        notes: tx.notes
                      }}
                      accounts={accounts}
                      assets={assets}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

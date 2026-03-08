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
import { computeTransactionPreview } from "@/lib/transaction-math";

interface TransactionsViewProps {
  transactions: Array<{
    id: number;
    datetime: string;
    type: string;
    account_id: number;
    asset_symbol: string;
    quote_asset_symbol?: string | null;
    quantity: number;
    price: number;
    gross_proceeds?: number | null;
    net_proceeds?: number | null;
    fee_amount: number;
    fee_currency: string | null;
    notes: string | null;
  }>;
  accounts: Array<{ id?: number; name: string; kind?: string; is_default?: boolean; base_currency?: string }>;
  assets: Array<{ symbol?: string; name: string; type?: "crypto" | "stock"; asset_class?: "crypto" | "stock"; [key: string]: unknown }>;
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

function getTypeBadgeStyles(type: string) {
  if (type === "BUY") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (type === "SELL") {
    return "bg-rose-100 text-rose-700";
  }
  return "bg-slate-100 text-slate-700";
}

function getTypeLabel(type: string, lang: "es" | "en") {
  if (lang === "es") {
    if (type === "BUY") {
      return "COMPRA";
    }
    if (type === "SELL") {
      return "VENTA";
    }
  }
  return type;
}

export function TransactionsView({ transactions, accounts, assets }: TransactionsViewProps) {
  const { lang } = useLanguage();
  const { pricesMap, loadOnce, refresh, status, lastUpdated } = usePrices();
  const accountNameById = new Map(accounts.map((account) => [Number(account.id), account.name]));
  const accountBaseById = new Map(
    accounts.map((account) => [Number(account.id), (account.base_currency || "USD").toUpperCase()])
  );

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
    <section className="space-y-6 md:space-y-8">
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
          const qty = Number(tx.quantity || 0);
          const price = Number(tx.price || 0);
          const fee = Number(tx.fee_amount || 0);
          const baseCurrency = accountBaseById.get(tx.account_id) || "USD";
          const preview = computeTransactionPreview({
            type: tx.type,
            assetSymbol: tx.asset_symbol,
            quoteAssetSymbol: tx.quote_asset_symbol,
            quantity: qty,
            price,
            feeAmount: fee,
            feeCurrency: tx.fee_currency,
            baseCurrency
          });
          const marketPrice = normalizedPriceBySymbol[String(tx.asset_symbol).toUpperCase()];
          const worth = Number.isFinite(marketPrice) && marketPrice > 0 ? preview.quantityNet * marketPrice : null;
          const pnl = worth !== null ? worth - preview.cost : null;
          const pnlPercent = worth !== null && preview.cost > 0 ? (pnl! / preview.cost) * 100 : null;
          const pnlToneClass =
            pnl === null ? "text-slate-900" : pnl > 0 ? "text-emerald-600" : pnl < 0 ? "text-rose-600" : "text-slate-500";
          return (
            <article key={`mobile-tx-${tx.id}`} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AssetIcon symbol={tx.asset_symbol} />
                  <div className="space-y-1">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getTypeBadgeStyles(tx.type)}`}
                    >
                      {getTypeLabel(tx.type, lang)}
                    </span>
                    <p className="text-sm font-semibold text-slate-900">{tx.asset_symbol}</p>
                    <p className="text-xs text-slate-500">{`${tx.asset_symbol}/${(tx.quote_asset_symbol || baseCurrency).toUpperCase()}`}</p>
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
                    quote_asset_symbol: tx.quote_asset_symbol,
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
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-500">{t("accounts.qty", lang)}</p>
                  <p className="font-semibold text-slate-900">{formatNumber(preview.quantityNet)}</p>
                  {preview.quantityNet !== preview.quantityGross ? (
                    <p className="text-[11px] text-slate-500">
                      Gross: {formatNumber(preview.quantityGross)} • Fee: {formatNumber(fee)} {tx.fee_currency || ""}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-slate-500">{t("transactions.price", lang)}</p>
                  <p className="font-semibold text-slate-900">{formatMoney(Number(tx.price))}</p>
                </div>
                <div>
                  <p className="text-slate-500">{t("transactions.cost", lang)}</p>
                  <p className="font-medium text-slate-500">
                    {preview.cost.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">{t("transactions.worth", lang)}</p>
                  {worth !== null ? (
                    <>
                      <p className={`font-semibold ${pnlToneClass}`}>
                        {worth.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </p>
                      {pnlPercent !== null ? (
                        <p className={`text-[11px] font-medium ${pnlToneClass}`}>
                          {pnlPercent >= 0 ? "+" : ""}
                          {pnlPercent.toFixed(2)}%
                        </p>
                      ) : null}
                    </>
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
            <tr className="border-b border-[color:var(--border)] bg-[color:var(--surface-2)] text-left text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
              <th className="table-cell">{t("transactions.datetime", lang)}</th>
              <th className="table-cell">{t("transactions.type", lang)}</th>
              <th className="table-cell">{t("transactions.asset", lang)}</th>
              <th className="table-cell">{t("transactions.account", lang)}</th>
              <th className="table-cell text-right">{t("accounts.qty", lang)}</th>
              <th className="table-cell text-right">{t("transactions.price", lang)}</th>
              <th className="table-cell text-right">{t("transactions.cost", lang)}</th>
              <th className="table-cell text-right">{t("transactions.worth", lang)}</th>
              <th className="table-cell text-right">{t("transactions.fee", lang)}</th>
              <th className="table-cell">{t("transactions.notes", lang)}</th>
              <th className="table-cell">{t("transactions.actions", lang)}</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => {
              const qty = Number(tx.quantity || 0);
              const price = Number(tx.price || 0);
              const fee = Number(tx.fee_amount || 0);
              const baseCurrency = accountBaseById.get(tx.account_id) || "USD";
              const preview = computeTransactionPreview({
                type: tx.type,
                assetSymbol: tx.asset_symbol,
                quoteAssetSymbol: tx.quote_asset_symbol,
                quantity: qty,
                price,
                feeAmount: fee,
                feeCurrency: tx.fee_currency,
                baseCurrency
              });
              const marketPrice = normalizedPriceBySymbol[String(tx.asset_symbol).toUpperCase()];
              const worth = Number.isFinite(marketPrice) && marketPrice > 0 ? preview.quantityNet * marketPrice : null;
              const pnl = worth !== null ? worth - preview.cost : null;
              const pnlPercent = worth !== null && preview.cost > 0 ? (pnl! / preview.cost) * 100 : null;
              const pnlToneClass =
                pnl === null ? "text-slate-900" : pnl > 0 ? "text-emerald-600" : pnl < 0 ? "text-rose-600" : "text-slate-500";
              return (
                <tr key={tx.id} className="border-b border-[color:var(--border)]/70 hover:bg-[color:var(--surface-2)]">
                  <td className="table-cell">{formatDateTimeUtc(tx.datetime)}</td>
                  <td className="table-cell">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getTypeBadgeStyles(tx.type)}`}>
                      {getTypeLabel(tx.type, lang)}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="inline-flex items-center gap-2">
                      <AssetIcon symbol={tx.asset_symbol} size={24} />
                      <span className="font-semibold">{tx.asset_symbol}</span>
                      <span className="text-xs text-slate-500">/{(tx.quote_asset_symbol || baseCurrency).toUpperCase()}</span>
                    </div>
                  </td>
                  <td className="table-cell">{accountNameById.get(tx.account_id) || tx.account_id}</td>
                  <td className="table-cell text-right tabular-nums" title={`Gross ${formatNumber(preview.quantityGross)} • Fee ${formatNumber(fee)} ${tx.fee_currency || ""}`}>
                    {formatNumber(preview.quantityNet)}
                  </td>
                  <td className="table-cell text-right tabular-nums">{formatMoney(price)}</td>
                  <td className="table-cell text-right tabular-nums text-slate-500">
                    {preview.cost.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </td>
                  <td className="table-cell text-right tabular-nums">
                    {worth !== null ? (
                      <div className={`inline-flex flex-col items-end ${pnlToneClass}`}>
                        <span className="font-semibold">
                          {worth.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                        </span>
                        {pnlPercent !== null ? (
                          <span className="text-xs font-medium">
                            {pnlPercent >= 0 ? "+" : ""}
                            {pnlPercent.toFixed(2)}%
                          </span>
                        ) : null}
                      </div>
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
                        quote_asset_symbol: tx.quote_asset_symbol,
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

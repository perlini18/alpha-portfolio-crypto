"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { PnlPill } from "@/components/PnlPill";
import { HoldingsTable, type DashboardHoldingRow } from "@/components/HoldingsTable";
import { AdsCarousel } from "@/components/AdsCarousel";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { usePrices } from "@/lib/prices-store";

interface PricesRefreshResponse {
  updated: number;
  failed?: Array<{ symbol: string; reason: string }>;
}

export function DashboardHoldings() {
  const { lang } = useLanguage();
  const { loadOnce, refresh: refreshPricesStore, status: pricesStatus, lastUpdated } = usePrices();
  const [holdings, setHoldings] = useState<DashboardHoldingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showZeroHoldings, setShowZeroHoldings] = useState(false);
  const [search, setSearch] = useState("");

  async function loadHoldings() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/holdings", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || t("dashboard.errorLoad", lang));
        return;
      }
      const data = (await res.json()) as DashboardHoldingRow[];
      setHoldings(data);
    } catch {
      setError(t("dashboard.errorLoad", lang));
    } finally {
      setLoading(false);
    }
  }

  async function refreshPrices() {
    setRefreshing(true);
    setError("");

    try {
      const res = await fetch("/api/prices/refresh?force=1", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || t("dashboard.errorRefresh", lang));
        return;
      }
      const body = (await res.json()) as PricesRefreshResponse;
      if (body.failed?.length) {
        const first = body.failed[0];
        setError(`Some prices failed (${first.symbol}: ${first.reason})`);
      }
      await refreshPricesStore(true);
      await loadHoldings();
    } catch {
      setError(t("dashboard.errorRefresh", lang));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadOnce();
    void loadHoldings();
  }, [loadOnce]);

  const visibleHoldings = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? holdings.filter((row) => {
          const account = (row.account || "").toLowerCase();
          return row.symbol.toLowerCase().includes(query) || row.name.toLowerCase().includes(query) || account.includes(query);
        })
      : holdings;

    const filtered = showZeroHoldings ? searched : searched.filter((row) => row.owned !== 0);
    return [...filtered].sort((a, b) => b.market_value - a.market_value);
  }, [holdings, search, showZeroHoldings]);

  const totalWorth = useMemo(
    () => visibleHoldings.reduce((acc, row) => acc + Number(row.market_value || 0), 0),
    [visibleHoldings]
  );
  const totalPnL = useMemo(
    () => visibleHoldings.reduce((acc, row) => acc + Number(row.pnl || 0), 0),
    [visibleHoldings]
  );
  const totalCostBasis = totalWorth - totalPnL;
  const totalPnlPct = totalCostBasis !== 0 ? (totalPnL / totalCostBasis) * 100 : null;
  const dailyChangeAmount = totalPnL;
  const dailyChangePct = totalWorth !== 0 ? (dailyChangeAmount / totalWorth) * 100 : 0;
  const dailyToneClass = dailyChangeAmount >= 0 ? "text-emerald-600" : "text-rose-600";
  const dailySign = dailyChangeAmount >= 0 ? "+" : "";
  const dailyPctSign = dailyChangePct >= 0 ? "+" : "";

  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-[color:var(--ink-900)] md:text-5xl">{t("dashboard.title", lang)}</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">{t("dashboard.cryptoOverview", lang)}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <article className="card">
          <p className="label-xs">{t("dashboard.totalWorthUsd", lang)}</p>
          <p className="mt-3 text-4xl font-extrabold leading-none text-[color:var(--ink-900)] md:text-5xl">{formatMoney(totalWorth)}</p>
          <p className={`mt-3 text-sm font-semibold ${dailyToneClass}`}>
            {dailySign}
            {formatMoney(Math.abs(dailyChangeAmount))} {lang === "es" ? "hoy" : "today"} ({dailyPctSign}
            {dailyChangePct.toFixed(2)}%)
          </p>
        </article>
        <StatCard
          label={t("dashboard.totalPnlUsd", lang)}
          value={formatMoney(totalPnL)}
          tone={totalPnL >= 0 ? "success" : "danger"}
          subvalue=""
        />
      </div>

      <p className="text-xs text-[color:var(--muted)]">{t("dashboard.valuesInUsd", lang)}</p>

      <p className="label-xs">Sponsored</p>
      <AdsCarousel page="dashboard" />

      <div className="card space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-2xl font-bold text-[color:var(--ink-900)]">{t("dashboard.holdings", lang)}</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("dashboard.searchPlaceholder", lang)}
              className="input-ui w-full sm:w-56"
            />
            <label className="inline-flex items-center gap-2 text-sm text-[color:var(--muted)]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[color:var(--border)] text-[color:var(--brand-500)] focus:ring-[color:var(--brand-400)]"
                checked={showZeroHoldings}
                onChange={(event) => setShowZeroHoldings(event.target.checked)}
              />
              {t("dashboard.showZero", lang)}
            </label>
            <button
              type="button"
              onClick={() => void refreshPrices()}
              disabled={refreshing || pricesStatus === "loading"}
              className="btn-secondary disabled:opacity-60"
            >
              {refreshing || pricesStatus === "loading" ? t("dashboard.refreshing", lang) : t("dashboard.refresh", lang)}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="label-xs">{t("dashboard.snapshot", lang)}</p>
          <PnlPill value={totalPnL} percent={totalPnlPct} />
        </div>
        <p className="text-xs text-[color:var(--muted)]">
          {lastUpdated ? `Updated ${Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000))}s ago` : "Updated —"}
        </p>

        {loading ? <div className="text-sm text-[color:var(--muted)]">{t("dashboard.loadingHoldings", lang)}</div> : null}
        {error ? <div className="text-sm text-[color:var(--danger)]">{error}</div> : null}
        {!loading && !error ? <HoldingsTable rows={visibleHoldings} /> : null}
      </div>
    </section>
  );
}

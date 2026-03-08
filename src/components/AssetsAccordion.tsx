"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney, formatNumber } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { PnlPill } from "@/components/PnlPill";
import { AdsCarousel } from "@/components/AdsCarousel";
import { AssetIcon } from "@/components/AssetIcon";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { usePrices } from "@/lib/prices-store";

interface AssetWithStats {
  key: string;
  symbol: string;
  name: string;
  type: "crypto" | "stock";
  asset_class?: "crypto" | "stock";
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

interface AssetTransaction {
  id: number;
  datetime: string;
  type: string;
  account_id?: number | null;
  account_name: string | null;
  quantity: number;
  price: number;
  fee_amount: number;
  notes: string | null;
}

interface AssetDetailsResponse {
  transactions: AssetTransaction[];
}

interface PricesRefreshResponse {
  updated: number;
  skipped: number;
  failed?: Array<{ symbol: string; reason: string }>;
  missingSymbols?: string[];
}

type SortOption = "symbol" | "holdings" | "pnl";

interface DetailsState {
  loading: boolean;
  error: string;
  transactions: AssetTransaction[];
}

const txDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC"
});

function formatTxDateTimeUtc(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : txDateTimeFormatter.format(date);
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function hashSeed(text: string) {
  let seed = 0;
  for (let i = 0; i < text.length; i += 1) {
    seed = (seed * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return seed || 1;
}

function generateSparklinePoints(asset: AssetWithStats, count = 14) {
  const seed = hashSeed(asset.symbol);
  const start = asset.avgCost > 0 ? asset.avgCost : asset.last_price * 0.8;
  const end = asset.last_price > 0 ? asset.last_price : start;
  const points: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 1 : i / (count - 1);
    const drift = start + (end - start) * t;
    const wave = Math.sin((t * 6.28) + (seed % 11)) * Math.max(end, 1) * 0.03;
    points.push(Math.max(0, drift + wave));
  }
  return points;
}

function MiniSparkline({ points, positive }: { points: number[]; positive: boolean }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 120;
  const height = 34;
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1 || 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-28">
      <polyline
        points={path}
        fill="none"
        stroke={positive ? "var(--success)" : "var(--danger)"}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AllocationDonut({ items, totalValue, lang }: { items: Array<{ symbol: string; value: number; pct: number }>; totalValue: number; lang: "es" | "en" }) {
  const colors = ["#4F55F1", "#7F84F6", "#16A34A", "#22C55E", "#EF4444", "#F59E0B", "#0EA5E9", "#9333EA"];
  const gradientParts: string[] = [];
  let cursor = 0;

  items.forEach((item, index) => {
    const start = cursor * 100;
    cursor += item.pct;
    const end = cursor * 100;
    const color = colors[index % colors.length];
    gradientParts.push(`${color} ${start}% ${end}%`);
  });

  return (
    <div className="card">
      <p className="label-xs">{t("portfolio.allocation", lang)}</p>
      <div className="mt-4 flex flex-col items-center gap-4 lg:flex-row lg:items-start">
        <div
          className="relative h-44 w-44 rounded-full"
          style={{
            background: gradientParts.length ? `conic-gradient(${gradientParts.join(", ")})` : "var(--border)"
          }}
        >
          <div className="absolute inset-5 rounded-full bg-white" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs uppercase tracking-wider text-[color:var(--muted)]">{t("portfolio.allocationTotal", lang)}</span>
            <span className="text-sm font-semibold text-[color:var(--ink-900)]">{formatMoney(totalValue)}</span>
          </div>
        </div>
        <div className="w-full space-y-2">
          {items.slice(0, 6).map((item, index) => (
            <div key={item.symbol} className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2 text-[color:var(--ink-900)]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[index % colors.length] }} />
                {item.symbol}
              </span>
              <span className="text-[color:var(--muted)]">{(item.pct * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BubbleChart({ items, lang }: { items: Array<{ symbol: string; value: number; pnl: number }>; lang: "es" | "en" }) {
  const maxValue = Math.max(...items.map((item) => Math.abs(item.value)), 1);
  const positioned = items.slice(0, 18).map((item, index) => {
    const ring = Math.floor(index / 6);
    const posInRing = index % 6;
    const radius = 18 + Math.sqrt(Math.abs(item.value) / maxValue) * 42;
    const angle = (Math.PI * 2 * posInRing) / 6 + ring * 0.3;
    const dist = 55 + ring * 80;
    const cx = 320 + Math.cos(angle) * dist;
    const cy = 140 + Math.sin(angle) * dist * 0.75;
    return { ...item, radius, cx, cy };
  });

  return (
    <div className="card">
      <p className="label-xs">{t("portfolio.bubbles", lang)}</p>
      <svg viewBox="0 0 640 280" className="mt-3 h-72 w-full">
        {positioned.map((item) => (
          <g key={item.symbol}>
            <circle
              cx={item.cx}
              cy={item.cy}
              r={item.radius}
              fill={item.pnl >= 0 ? "rgba(22,163,74,0.18)" : "rgba(239,68,68,0.18)"}
              stroke={item.pnl >= 0 ? "var(--success)" : "var(--danger)"}
              strokeWidth="1.5"
            />
            <text x={item.cx} y={item.cy} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="700" fill="var(--ink-900)">
              {item.symbol}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function generatePortfolioSeries(totalValue: number, totalPnL: number, days = 30) {
  const base = Math.max(totalValue - totalPnL * 0.35, totalValue * 0.72, 1);
  const drift = (totalValue - base) / Math.max(days - 1, 1);
  const points: number[] = [];

  for (let i = 0; i < days; i += 1) {
    const t = i / Math.max(days - 1, 1);
    const wave = Math.sin(t * 9.4) * base * 0.03 + Math.cos(t * 6.1) * base * 0.015;
    points.push(Math.max(0, base + drift * i + wave));
  }
  return points;
}

function PortfolioValueChart({ points, lang }: { points: number[]; lang: "es" | "en" }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 620;
  const height = 220;
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1 || 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="card">
      <p className="label-xs">{t("portfolio.value30d", lang)}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-56 w-full">
        <polyline points={path} fill="none" stroke="var(--brand-500)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function AssetsAccordion() {
  const { lang } = useLanguage();
  const { loadOnce, refresh: refreshPricesStore } = usePrices();
  const [activeClass, setActiveClass] = useState<"crypto" | "stock">("crypto");
  const [assets, setAssets] = useState<AssetWithStats[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [assetsError, setAssetsError] = useState("");
  const [missingSymbols, setMissingSymbols] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("symbol");
  const [showZeroHoldings, setShowZeroHoldings] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detailsBySymbol, setDetailsBySymbol] = useState<Record<string, DetailsState>>({});

  async function loadAssets() {
    setLoadingAssets(true);
    setAssetsError("");

    try {
      const res = await fetch("/api/assets/with-stats", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setAssetsError(body?.error || t("dashboard.errorLoad", lang));
        return;
      }

      const data = (await res.json()) as AssetWithStats[];
      setAssets(data);
    } catch {
      setAssetsError(t("dashboard.errorLoad", lang));
    } finally {
      setLoadingAssets(false);
    }
  }

  useEffect(() => {
    void loadOnce();
    void loadAssets();
  }, [loadOnce]);

  async function refreshPrices() {
    setRefreshingPrices(true);
    setAssetsError("");

    try {
      const res = await fetch("/api/prices/refresh?force=1", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setAssetsError(body?.error || t("dashboard.errorRefresh", lang));
        return;
      }

      const refreshResult = (await res.json()) as PricesRefreshResponse;
      setMissingSymbols((refreshResult.missingSymbols || []).map((symbol) => symbol.toUpperCase()));
      await refreshPricesStore(true);
      await loadAssets();
    } catch {
      setAssetsError(t("dashboard.errorRefresh", lang));
    } finally {
      setRefreshingPrices(false);
    }
  }

  async function loadAssetTransactions(symbol: string) {
    setDetailsBySymbol((prev) => ({
      ...prev,
      [symbol]: {
        loading: true,
        error: "",
        transactions: prev[symbol]?.transactions || []
      }
    }));

    try {
      const res = await fetch(`/api/portfolio/asset/${symbol}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setDetailsBySymbol((prev) => ({
          ...prev,
          [symbol]: {
            loading: false,
            error: body?.error || t("portfolio.loadTxError", lang),
            transactions: prev[symbol]?.transactions || []
          }
        }));
        return;
      }

      const data = (await res.json()) as AssetDetailsResponse;
      setDetailsBySymbol((prev) => ({
        ...prev,
        [symbol]: {
          loading: false,
          error: "",
          transactions: data.transactions || []
        }
      }));
    } catch {
      setDetailsBySymbol((prev) => ({
        ...prev,
        [symbol]: {
          loading: false,
          error: t("portfolio.unexpectedTxError", lang),
          transactions: prev[symbol]?.transactions || []
        }
      }));
    }
  }

  function onToggleExpand(key: string, symbol: string) {
    const opening = !expanded[key];

    setExpanded((prev) => ({
      ...prev,
      [key]: opening
    }));

    if (opening && (!detailsBySymbol[symbol] || detailsBySymbol[symbol].error)) {
      void loadAssetTransactions(symbol);
    }
  }

  const classFilteredAssets = useMemo(
    () =>
      assets.filter((asset) => {
        const assetClass = asset.asset_class || asset.type || "crypto";
        return assetClass === activeClass;
      }),
    [activeClass, assets]
  );

  const visibleAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? classFilteredAssets.filter((asset) => {
          return asset.symbol.toLowerCase().includes(query) || asset.name.toLowerCase().includes(query);
        })
      : classFilteredAssets;
    const holdingsFiltered = showZeroHoldings
      ? filtered
      : filtered.filter((asset) => asset.ownedQty !== 0 || asset.txCount > 0);

    const sorted = [...holdingsFiltered];

    if (sortBy === "holdings") {
      sorted.sort((a, b) => b.marketValue - a.marketValue);
      return sorted;
    }

    if (sortBy === "pnl") {
      sorted.sort((a, b) => b.totalPnL - a.totalPnL);
      return sorted;
    }

    sorted.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return sorted;
  }, [classFilteredAssets, search, showZeroHoldings, sortBy]);

  const nonZeroHoldings = useMemo(
    () => classFilteredAssets.filter((asset) => asset.ownedQty !== 0),
    [classFilteredAssets]
  );
  const totalValue = useMemo(
    () => nonZeroHoldings.reduce((sum, asset) => sum + Number(asset.marketValue || 0), 0),
    [nonZeroHoldings]
  );
  const totalPnL = useMemo(
    () => nonZeroHoldings.reduce((sum, asset) => sum + Number(asset.totalPnL || 0), 0),
    [nonZeroHoldings]
  );
  const accountsCount = useMemo(
    () =>
      new Set(
        nonZeroHoldings
          .map((asset) => asset.account_name)
          .filter((account): account is string => Boolean(account && account.trim().length > 0))
      ).size,
    [nonZeroHoldings]
  );
  const exchangeCount = accountsCount;
  const dominantAsset = useMemo(() => {
    if (totalValue <= 0 || nonZeroHoldings.length === 0) {
      return null;
    }
    const top = [...nonZeroHoldings].sort((a, b) => b.marketValue - a.marketValue)[0];
    const ratio = top.marketValue / totalValue;
    if (ratio > 0.7) {
      return { symbol: top.symbol, ratio };
    }
    return null;
  }, [nonZeroHoldings, totalValue]);

  const allocationItems = useMemo(() => {
    if (totalValue <= 0) {
      return [] as Array<{ symbol: string; value: number; pct: number; pnl: number }>;
    }
    return [...nonZeroHoldings]
      .sort((a, b) => b.marketValue - a.marketValue)
      .map((asset) => ({
        symbol: asset.symbol,
        value: asset.marketValue,
        pct: asset.marketValue / totalValue,
        pnl: asset.totalPnL
      }));
  }, [nonZeroHoldings, totalValue]);

  const bubbleItems = useMemo(
    () =>
      nonZeroHoldings.map((asset) => ({
        symbol: asset.symbol,
        value: asset.marketValue,
        pnl: asset.totalPnL
      })),
    [nonZeroHoldings]
  );

  const portfolioSeries = useMemo(() => generatePortfolioSeries(totalValue, totalPnL, 30), [totalValue, totalPnL]);

  function formatUpdatedAgo(value: string | null | undefined) {
    if (!value) {
      return t("portfolio.updatedNow", lang);
    }

    const date = new Date(value);
    const ms = Date.now() - date.getTime();
    if (!Number.isFinite(ms) || ms < 60_000) {
      return t("portfolio.updatedNow", lang);
    }

    const mins = Math.floor(ms / 60_000);
    if (mins < 60) {
      return t("portfolio.updatedMin", lang).replace("{n}", String(mins));
    }

    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      return t("portfolio.updatedHr", lang).replace("{n}", String(hours));
    }

    const days = Math.floor(hours / 24);
    return t("portfolio.updatedDay", lang).replace("{n}", String(days));
  }

  function formatPercent(value: number) {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6 md:space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-[color:var(--ink-900)]">{t("portfolio.title", lang)}</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{t("portfolio.subtitle", lang)}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--card)] p-1">
            <button
              type="button"
              onClick={() => setActiveClass("crypto")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                activeClass === "crypto"
                  ? "bg-[color:var(--brand-500)] text-white"
                  : "text-[color:var(--muted)] hover:bg-[color:var(--bg-50)]"
              }`}
            >
              {t("portfolio.tabCrypto", lang)}
            </button>
            <button
              type="button"
              onClick={() => setActiveClass("stock")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                activeClass === "stock"
                  ? "bg-[color:var(--surface-2)] text-[color:var(--ink-900)]"
                  : "text-[color:var(--muted)] hover:bg-[color:var(--bg-50)]"
              }`}
            >
              {t("portfolio.tabStocks", lang)} <span className="opacity-80">• {t("portfolio.comingSoon", lang)}</span>
            </button>
          </div>
        </div>
        <button onClick={() => void refreshPrices()} disabled={refreshingPrices || loadingAssets} className="btn-secondary w-fit disabled:opacity-60">
          {refreshingPrices ? t("portfolio.refreshing", lang) : t("portfolio.refresh", lang)}
        </button>
      </div>

      <AdsCarousel page="portfolio" />

      {activeClass === "stock" ? (
        <div className="card py-12 text-center">
          <div className="mx-auto mb-3 inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--bg-50)] px-3 py-1 text-xs font-semibold text-[color:var(--muted)]">
            {t("portfolio.comingSoon", lang)}
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[color:var(--ink-900)]">
            {t("portfolio.stocksComingSoonTitle", lang)}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[color:var(--muted)]">
            {t("portfolio.stocksComingSoonDescription", lang)}
          </p>
          <button type="button" disabled className="btn-secondary mt-5 cursor-default opacity-70">
            {t("portfolio.stayTuned", lang)}
          </button>
        </div>
      ) : null}

      {activeClass === "stock" ? null : (
        <>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label={t("portfolio.totalValue", lang)} value={formatMoney(totalValue)} />
        <StatCard label={t("portfolio.totalPnl", lang)} value={formatMoney(totalPnL)} tone={totalPnL >= 0 ? "success" : "danger"} />
        <StatCard label={t("portfolio.accounts", lang)} value={String(accountsCount)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AllocationDonut items={allocationItems} totalValue={totalValue} lang={lang} />
        <div className="lg:col-span-2">
          <PortfolioValueChart points={portfolioSeries} lang={lang} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BubbleChart items={bubbleItems} lang={lang} />
        </div>
        <div className="card space-y-3">
          <p className="label-xs">{t("portfolio.insights", lang)}</p>
          {dominantAsset ? (
            <p className="rounded-xl border border-[color:rgba(239,68,68,0.2)] bg-[color:rgba(239,68,68,0.08)] p-3 text-sm text-[color:var(--danger)]">
              {t("portfolio.diversificationWarning", lang)}: {dominantAsset.symbol} {(dominantAsset.ratio * 100).toFixed(1)}%
            </p>
          ) : (
            <p className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-50)] p-3 text-sm text-[color:var(--muted)]">
              {t("portfolio.diversificationHealthy", lang)}
            </p>
          )}
          <p className="text-sm text-[color:var(--ink-900)]">{t("portfolio.exchangesUsed", lang)}: <strong>{exchangeCount}</strong></p>
          <p className="text-sm text-[color:var(--ink-900)]">
            {t("portfolio.pnlSummary", lang)}: <span className={totalPnL >= 0 ? "text-[color:var(--success)] font-semibold" : "text-[color:var(--danger)] font-semibold"}>{formatMoney(totalPnL)}</span>
          </p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-col gap-3 md:gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:max-w-xl">
            <input
              type="text"
              placeholder={t("portfolio.searchPlaceholder", lang)}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-ui w-full"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="input-ui w-full sm:w-auto">
              <option value="symbol">{t("portfolio.sortSymbol", lang)}</option>
              <option value="holdings">{t("portfolio.sortHoldings", lang)}</option>
              <option value="pnl">{t("portfolio.sortPnl", lang)}</option>
            </select>
            <button onClick={() => void refreshPrices()} disabled={refreshingPrices || loadingAssets} className="btn-secondary w-full whitespace-nowrap sm:w-auto disabled:opacity-60">
              {refreshingPrices ? t("portfolio.refreshing", lang) : t("portfolio.refresh", lang)}
            </button>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={showZeroHoldings}
          onClick={() => setShowZeroHoldings((current) => !current)}
          className="inline-flex w-fit items-center gap-2 text-sm text-[color:var(--muted)]"
        >
          <span
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              showZeroHoldings ? "bg-[color:var(--brand-500)]" : "bg-[color:var(--border)]"
            }`}
          >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-[color:var(--card)] transition ${
                    showZeroHoldings ? "translate-x-5" : "translate-x-1"
                  }`}
                />
          </span>
          {t("portfolio.showZero", lang)}
        </button>

        {assetsError ? <p className="text-sm text-[color:var(--danger)]">{assetsError}</p> : null}

        <div className="space-y-3 md:hidden">
          {visibleAssets.map((asset) => {
            const totalCostBasis = asset.avgCost * asset.ownedQty;
            const pnlPct = totalCostBasis > 0 ? (asset.totalPnL / totalCostBasis) * 100 : null;
            return (
              <article key={`mobile-${asset.key}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AssetIcon symbol={asset.symbol} />
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--ink-900)]">{asset.symbol}</p>
                      <p className="text-xs text-[color:var(--muted)]">{asset.name}</p>
                      <p className="text-xs text-[color:var(--muted)]">{asset.account_name || "—"}</p>
                    </div>
                  </div>
                  <PnlPill value={asset.totalPnL} percent={pnlPct} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[color:var(--muted)]">{t("portfolio.mobileOwned", lang)}</p>
                    <p className="font-semibold text-[color:var(--ink-900)]">{formatNumber(asset.ownedQty)}</p>
                  </div>
                  <div>
                    <p className="text-[color:var(--muted)]">{t("transactions.price", lang)}</p>
                    <p className="font-semibold text-[color:var(--ink-900)]">{formatMoney(asset.last_price)}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-xs text-[color:var(--muted)]">{t("portfolio.mobileMarketValue", lang)}</p>
                  <p className="text-2xl font-extrabold tracking-tight text-[color:var(--ink-900)]">{formatMoney(asset.marketValue)}</p>
                </div>
              </article>
            );
          })}
          {!loadingAssets && visibleAssets.length === 0 ? (
            <p className="px-2 py-4 text-sm text-[color:var(--muted)]">{t("portfolio.noAssets", lang)}</p>
          ) : null}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[1080px] w-full border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--border)] bg-[color:var(--surface-2)] text-left text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
                <th className="px-4 py-3">{t("transactions.asset", lang)}</th>
                <th className="px-4 py-3">{t("transactions.type", lang)}</th>
                <th className="px-4 py-3">{t("transactions.price", lang)}</th>
                <th className="px-4 py-3">{t("accounts.qty", lang)}</th>
                <th className="px-4 py-3">{t("accounts.value", lang)}</th>
                <th className="px-4 py-3">{t("dashboard.totalPnl", lang)}</th>
                <th className="px-4 py-3">{t("transactions.trend", lang)}</th>
                <th className="px-4 py-3">{t("transactions.datetime", lang)}</th>
                <th className="px-4 py-3">{t("accounts.expand", lang)}</th>
              </tr>
            </thead>

            <tbody>
              {visibleAssets.map((asset) => {
                const open = Boolean(expanded[asset.key]);
                const details = detailsBySymbol[asset.symbol];
                const scopedTransactions = (details?.transactions || []).filter((tx) => {
                  if (asset.account_id != null && tx.account_id != null) {
                    return tx.account_id === asset.account_id;
                  }
                  if (asset.account_name && tx.account_name) {
                    return tx.account_name === asset.account_name;
                  }
                  return true;
                });
                const totalCostBasis = asset.avgCost * asset.ownedQty;
                const pnlPct = totalCostBasis > 0 ? (asset.totalPnL / totalCostBasis) * 100 : null;
                const sparklinePoints = generateSparklinePoints(asset);

                return (
                  <Fragment key={asset.key}>
                    <tr className="h-16 border-b border-[color:var(--border)] align-top hover:bg-[color:var(--surface-2)]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <AssetIcon symbol={asset.symbol} />
                          <div>
                            <Link href={`/assets/${asset.symbol}`} className="text-sm font-semibold text-[color:var(--ink-900)] hover:underline">
                              {asset.symbol}
                            </Link>
                            <div className="text-sm text-[color:var(--muted)]">
                              {asset.name} • {asset.txCount} tx • {asset.account_name || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[color:var(--ink-900)]">
                        {(asset.asset_class || asset.type) === "stock" ? t("nav.stocks", lang) : t("nav.crypto", lang)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-[color:var(--ink-900)]">{formatMoney(asset.last_price)}</div>
                        {asset.noLivePrice || missingSymbols.includes(asset.symbol.toUpperCase()) ? (
                          <span className="mt-1 inline-flex rounded-full bg-[color:var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--muted)]">
                            {t("portfolio.noLivePrice", lang)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-[color:var(--ink-900)]">{formatNumber(asset.ownedQty)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[color:var(--ink-900)]">{formatMoney(asset.marketValue)}</td>
                      <td className="px-4 py-3">
                        <PnlPill value={asset.totalPnL} percent={pnlPct} />
                      </td>
                      <td className="px-4 py-3">
                        <MiniSparkline points={sparklinePoints} positive={asset.totalPnL >= 0} />
                      </td>
                      <td className="px-4 py-3 text-sm text-[color:var(--muted)]" title={asset.updated_at || ""}>
                        {asset.updated_at ? formatUpdatedAgo(asset.updated_at) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onToggleExpand(asset.key, asset.symbol)}
                          className="inline-flex items-center rounded-full p-2 text-[color:var(--muted)] hover:border hover:border-[color:var(--border)] hover:bg-[color:var(--card)]"
                          aria-label={t("portfolio.toggleAssetTx", lang).replace("{symbol}", asset.symbol)}
                        >
                          <Chevron open={open} />
                        </button>
                      </td>
                    </tr>

                    {open ? (
                      <tr className="border-b border-[color:var(--border)] bg-[color:var(--surface-2)]/55">
                        <td className="table-cell" colSpan={9}>
                          {details?.loading ? (
                            <p className="text-sm text-slate-500">{t("portfolio.loadingTransactions", lang)}</p>
                          ) : details?.error ? (
                            <p className="text-sm text-rose-600">{details.error}</p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--card)]">
                              <table className="min-w-full border-collapse">
                                <thead>
                                  <tr className="border-b border-[color:var(--border)] text-left text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
                                    <th className="table-cell">{t("transactions.datetime", lang)}</th>
                                    <th className="table-cell">{t("transactions.type", lang)}</th>
                                    <th className="table-cell">{t("accounts.kindExchange", lang)}</th>
                                    <th className="table-cell">{t("accounts.qty", lang)}</th>
                                    <th className="table-cell">{t("transactions.price", lang)}</th>
                                    <th className="table-cell">{t("transactions.cost", lang)}</th>
                                    <th className="table-cell">{t("transactions.worth", lang)}</th>
                                    <th className="table-cell">{t("transactions.delta", lang)}</th>
                                    <th className="table-cell">{t("transactions.fee", lang)}</th>
                                    <th className="table-cell">{t("transactions.notes", lang)}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {scopedTransactions.map((tx) => (
                                    <tr key={tx.id} className="border-b border-[color:var(--border)]/70">
                                      <td className="table-cell">{formatTxDateTimeUtc(tx.datetime)}</td>
                                      <td className="table-cell">{tx.type}</td>
                                      <td className="table-cell text-slate-500">{tx.account_name || "—"}</td>
                                      <td className="table-cell">{formatNumber(Number(tx.quantity))}</td>
                                      <td className="table-cell">{formatMoney(Number(tx.price))}</td>
                                      <td className="table-cell">
                                        {formatMoney(Number(tx.quantity) * Number(tx.price) + Number(tx.fee_amount || 0))}
                                      </td>
                                      <td className="table-cell">{formatMoney(Number(tx.quantity) * Number(asset.last_price))}</td>
                                      <td
                                        className={`table-cell font-semibold ${
                                          Number(tx.price) > 0
                                            ? Number(asset.last_price) - Number(tx.price) >= 0
                                              ? "text-emerald-600"
                                              : "text-rose-600"
                                            : "text-slate-500"
                                        }`}
                                      >
                                        {Number(tx.price) > 0
                                          ? formatPercent(((Number(asset.last_price) - Number(tx.price)) / Number(tx.price)) * 100)
                                          : "-"}
                                      </td>
                                      <td className="table-cell">{formatMoney(Number(tx.fee_amount || 0))}</td>
                                      <td className="table-cell text-slate-500">{tx.notes || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {details && scopedTransactions.length === 0 ? (
                                <p className="px-4 py-3 text-sm text-slate-500">{t("portfolio.noTxForAsset", lang)}</p>
                              ) : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!loadingAssets && visibleAssets.length === 0 ? (
            <p className="px-2 py-4 text-sm text-[color:var(--muted)]">{t("portfolio.noAssets", lang)}</p>
          ) : null}
        </div>
      </div>
        </>
      )}
    </section>
  );
}

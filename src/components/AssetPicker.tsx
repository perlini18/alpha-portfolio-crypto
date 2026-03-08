"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";

interface AssetOption {
  symbol: string;
  name: string;
  type: "crypto" | "stock";
  asset_class?: "crypto" | "stock";
  provider_id?: string | null;
  coingecko_id?: string | null;
  coingecko_symbol?: string | null;
  last_price?: number;
  updated_at?: string;
  last_price_updated_at?: string;
}

interface InstrumentResult {
  id: string;
  symbol: string;
  name: string;
  thumb?: string | null;
}

interface AssetPickerProps {
  assets: AssetOption[];
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  onAssetResolved?: (asset: AssetOption) => void;
  error?: string;
}

const QUICK_PICKS: Array<{ symbol: string; name: string; coingecko_id: string }> = [
  { symbol: "BTC", name: "Bitcoin", coingecko_id: "bitcoin" },
  { symbol: "ETH", name: "Ethereum", coingecko_id: "ethereum" },
  { symbol: "SOL", name: "Solana", coingecko_id: "solana" },
  { symbol: "BNB", name: "BNB", coingecko_id: "binancecoin" },
  { symbol: "ADA", name: "Cardano", coingecko_id: "cardano" },
  { symbol: "XRP", name: "XRP", coingecko_id: "ripple" },
  { symbol: "DOGE", name: "Dogecoin", coingecko_id: "dogecoin" },
  { symbol: "DOT", name: "Polkadot", coingecko_id: "polkadot" },
  { symbol: "MATIC", name: "Polygon", coingecko_id: "polygon" },
  { symbol: "LINK", name: "Chainlink", coingecko_id: "chainlink" },
  { symbol: "ROSE", name: "Oasis Network", coingecko_id: "oasis-network" }
];

export function AssetPicker({ assets, selectedSymbol, onSelect, onAssetResolved, error }: AssetPickerProps) {
  const { lang } = useLanguage();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [providerWarning, setProviderWarning] = useState("");
  const [results, setResults] = useState<InstrumentResult[]>([]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.symbol === selectedSymbol),
    [assets, selectedSymbol]
  );

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setProviderWarning("");
    }
  }, [query]);

  async function upsertFromProvider(item: { symbol: string; name: string; coingecko_id: string }) {
    setSaving(true);
    setPickerError("");
    try {
      const res = await fetch("/api/assets/upsertFromProvider", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "coingecko",
          coingecko_id: item.coingecko_id,
          symbol: item.symbol,
          name: item.name
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setPickerError(body?.error || t("assetPicker.saveProviderError", lang));
        return;
      }

      const asset = (await res.json()) as AssetOption;
      onSelect(asset.symbol);
      onAssetResolved?.(asset);
      setQuery("");
      setOpen(false);
      setResults([]);
      setProviderWarning("");
    } catch {
      setPickerError(t("assetPicker.saveProviderError", lang));
    } finally {
      setSaving(false);
    }
  }

  async function searchAssets(nextQuery: string) {
    const trimmed = nextQuery.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setProviderWarning("");
      return;
    }

    setLoading(true);
    setPickerError("");
    setProviderWarning("");

    try {
      const res = await fetch(`/api/instruments/search?q=${encodeURIComponent(trimmed)}&type=crypto&limit=10`, {
        cache: "no-store"
      });
      if (!res.ok) {
        setPickerError(t("assetPicker.searchError", lang));
        return;
      }

      const payload = (await res.json()) as InstrumentResult[] | { warning?: string; items?: InstrumentResult[] };
      if (Array.isArray(payload)) {
        setResults(payload);
        return;
      }

      setResults(payload.items || []);
      if (payload.warning === "provider_unavailable") {
        setProviderWarning(t("assetPicker.providerUnavailable", lang));
      }
    } catch {
      setPickerError(t("assetPicker.searchError", lang));
    } finally {
      setLoading(false);
    }
  }

  async function createCustomAsset() {
    const symbol = query.trim().toUpperCase();
    if (symbol.length < 2) {
      setPickerError(t("assetPicker.createCustomError", lang));
      return;
    }

    setSaving(true);
    setPickerError("");

    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          name: symbol,
          type: "crypto"
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setPickerError(body?.error || t("assetPicker.createCustomError", lang));
        return;
      }

      const asset = (await res.json()) as AssetOption;
      onSelect(asset.symbol);
      onAssetResolved?.(asset);
      setQuery("");
      setOpen(false);
      setResults([]);
    } catch {
      setPickerError(t("assetPicker.createCustomError", lang));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="mb-2 flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-800">🪙 {t("assetPicker.asset", lang)}</label>
      <p className="text-xs text-slate-500">{t("assetPicker.searchProvider", lang)}</p>

      <input
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition-all focus:ring-2 focus:ring-slate-300"
        placeholder={t("assetPicker.placeholder", lang)}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          void searchAssets(next);
        }}
      />

      <div className="flex flex-wrap gap-2">
        {QUICK_PICKS.map((item) => {
          const active = selectedSymbol === item.symbol;
          return (
            <button
              key={item.symbol}
              type="button"
              onClick={() => void upsertFromProvider(item)}
              disabled={saving}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                active
                  ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              } disabled:opacity-60`}
            >
              <span className="inline-flex items-center gap-1">{item.symbol}</span>
            </button>
          );
        })}
      </div>

      {selectedAsset ? (
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          {t("assetPicker.selected", lang)}: {selectedAsset.symbol} — {selectedAsset.name}
        </span>
      ) : null}

      {open ? (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
          {loading ? <p className="px-3 py-2 text-sm text-slate-500">{t("assetPicker.searching", lang)}</p> : null}

          {!loading && results.length > 0
            ? results.map((item) => (
                <button
                  key={`${item.id}:${item.symbol}`}
                  type="button"
                  onClick={() =>
                    void upsertFromProvider({
                      coingecko_id: item.id,
                      symbol: item.symbol,
                      name: item.name
                    })
                  }
                  disabled={saving}
                  className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-60"
                >
                  <span className="flex items-center gap-2 text-sm text-slate-800">
                    {item.thumb ? <img src={item.thumb} alt="" className="h-4 w-4 rounded-full" /> : null}
                    {item.name} ({item.symbol})
                  </span>
                </button>
              ))
            : null}

          {!loading && query.trim().length >= 2 && results.length === 0 ? (
            <div className="space-y-2 px-3 py-2">
              <p className="text-sm text-slate-500">{t("assetPicker.noMatches", lang)}</p>
              <button
                type="button"
                onClick={() => void createCustomAsset()}
                disabled={saving}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {t("assetPicker.createCustom", lang)}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {providerWarning ? <p className="text-xs text-amber-600">{providerWarning}</p> : null}
      {pickerError ? <p className="text-xs text-rose-600">{pickerError}</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

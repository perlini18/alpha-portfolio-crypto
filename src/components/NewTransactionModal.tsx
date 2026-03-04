"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { AssetPicker } from "@/components/AssetPicker";
import { TransactionTypeTabs, type TradeTab } from "@/components/TransactionTypeTabs";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";

interface Option {
  id?: number;
  symbol?: string;
  name: string;
  type?: "crypto" | "stock";
  kind?: string;
  is_default?: boolean;
  last_price?: number;
  updated_at?: string;
  last_price_updated_at?: string;
  provider_id?: string | null;
  coingecko_id?: string | null;
  coingecko_symbol?: string | null;
}

export interface EditableTransaction {
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
}

interface NewTransactionModalProps {
  accounts: Option[];
  assets: Option[];
  initialTransaction?: EditableTransaction;
  triggerContent?: ReactNode;
  triggerClassName?: string;
  triggerDisabled?: boolean;
}

interface FormState {
  datetime: string;
  account_id: string;
  asset_symbol: string;
  quantity: string;
  price: string;
  fee_amount: string;
  fee_currency: string;
  notes: string;
}

type FieldKey =
  | "asset_symbol"
  | "account_id"
  | "price"
  | "quantity"
  | "fee_amount"
  | "fee_currency"
  | "datetime";

function toLocalDateTimeInput(date: Date) {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function getDefaultAccountId(accounts: Option[]) {
  const defaultAccount = accounts.find((account) => account.is_default);
  if (defaultAccount?.id) {
    return String(defaultAccount.id);
  }

  return "";
}

function formatAccountOptionLabel(account: Option) {
  if (!account.kind) {
    return account.name;
  }

  return `${account.name} · ${account.kind.replaceAll("_", " ")}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function getTradeTabFromType(type?: string): TradeTab {
  return type === "SELL" ? "SELL" : "BUY";
}

function isPriceOlderThan30Minutes(asset?: Option) {
  const source = asset?.last_price_updated_at ?? asset?.updated_at;
  if (!source) {
    return true;
  }

  const ts = new Date(source).getTime();
  if (!Number.isFinite(ts)) {
    return true;
  }

  return Date.now() - ts > 30 * 60 * 1000;
}

function getInitialFormState(
  initialTransaction: EditableTransaction | undefined,
  accounts: Option[],
  assets: Option[]
): FormState {
  if (!initialTransaction) {
    return {
      datetime: toLocalDateTimeInput(new Date()),
      account_id: getDefaultAccountId(accounts),
      asset_symbol: "",
      quantity: "",
      price: "",
      fee_amount: "",
      fee_currency: "USD",
      notes: ""
    };
  }

  return {
    datetime: toLocalDateTimeInput(new Date(initialTransaction.datetime)),
    account_id: String(initialTransaction.account_id),
    asset_symbol: initialTransaction.asset_symbol,
    quantity: String(initialTransaction.quantity),
    price: String(initialTransaction.price),
    fee_amount: String(initialTransaction.fee_amount ?? 0),
    fee_currency: initialTransaction.fee_currency || "USD",
    notes: initialTransaction.notes || ""
  };
}

export function NewTransactionModal({
  accounts,
  assets,
  initialTransaction,
  triggerContent,
  triggerClassName,
  triggerDisabled
}: NewTransactionModalProps) {
  const router = useRouter();
  const { lang } = useLanguage();
  const isEditMode = Boolean(initialTransaction);

  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsFetchError, setAccountsFetchError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [accountsState, setAccountsState] = useState<Option[]>(accounts);
  const [assetsState, setAssetsState] = useState<Option[]>(assets);
  const [marketRefreshing, setMarketRefreshing] = useState(false);
  const [tradeTab, setTradeTab] = useState<TradeTab>(getTradeTabFromType(initialTransaction?.type));
  const [form, setForm] = useState<FormState>(getInitialFormState(initialTransaction, accounts, assets));
  const refreshInFlightRef = useRef(false);
  const lastRefreshBySymbolRef = useRef<Record<string, number>>({});
  const failedSymbolsRef = useRef<Set<string>>(new Set());

  const pickerAssets = assetsState
    .filter((asset): asset is { symbol: string; name: string; type: "crypto" | "stock" } =>
      Boolean(asset.symbol && asset.name && asset.type)
    );
  const selectedAsset = pickerAssets.find((asset) => asset.symbol === form.asset_symbol);
  const selectedSymbol = selectedAsset?.symbol ?? null;
  const selectedAssetDetails = assetsState.find((asset) => asset.symbol === form.asset_symbol);
  const marketPrice = Number(selectedAssetDetails?.last_price ?? 0);
  const hasProviderId = Boolean(selectedAssetDetails?.coingecko_id || selectedAssetDetails?.provider_id);

  const quantityNum = Number(form.quantity || 0);
  const priceNum = Number(form.price || 0);
  const feeNum = Number(form.fee_amount || 0);
  const subtotal = priceNum * quantityNum;
  const total = subtotal + feeNum;

  const errors = useMemo(() => {
    const next: Record<string, string> = {};

    if (!form.asset_symbol || !selectedAsset) {
      next.asset_symbol = t("txModal.selectAsset", lang);
    }

    if (!(priceNum > 0)) {
      next.price = t("txModal.errorPrice", lang);
    }

    if (!(quantityNum > 0)) {
      next.quantity = t("txModal.errorAmount", lang);
    }

    if (feeNum < 0 || Number.isNaN(feeNum)) {
      next.fee_amount = t("txModal.errorFee", lang);
    }

    if (!form.account_id) {
      next.account_id = t("txModal.selectAccount", lang);
    }

    if (!form.datetime || Number.isNaN(new Date(form.datetime).getTime())) {
      next.datetime = t("txModal.validDatetime", lang);
    }

    if (!form.fee_currency) {
      next.fee_currency = t("txModal.errorFeeCurrency", lang);
    }

    return next;
  }, [
    feeNum,
    form.account_id,
    form.asset_symbol,
    form.datetime,
    form.fee_currency,
    lang,
    priceNum,
    quantityNum,
    selectedAsset
  ]);

  const formInvalid = Object.keys(errors).length > 0;

  function markTouched(field: FieldKey) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function shouldShowError(field: FieldKey) {
    return Boolean(submitted || touched[field]);
  }

  useEffect(() => {
    setAccountsState(accounts);
  }, [accounts]);

  useEffect(() => {
    setAssetsState(assets);
  }, [assets]);

  function upsertAsset(asset: Option) {
    if (!asset.symbol) {
      return;
    }
    setAssetsState((prev) => {
      const without = prev.filter((item) => item.symbol !== asset.symbol);
      return [...without, asset].sort((a, b) => (a.symbol ?? "").localeCompare(b.symbol ?? ""));
    });
  }

  async function refreshSelectedAssetPrice(symbol: string, options?: { manual?: boolean }) {
    const manual = Boolean(options?.manual);
    const now = Date.now();
    const lastTs = lastRefreshBySymbolRef.current[symbol] ?? 0;

    if (refreshInFlightRef.current) {
      return false;
    }
    if (!manual && now - lastTs < 60_000) {
      return false;
    }
    if (!manual && failedSymbolsRef.current.has(symbol)) {
      return false;
    }

    refreshInFlightRef.current = true;
    lastRefreshBySymbolRef.current[symbol] = now;
    setMarketRefreshing(true);

    try {
      await fetch("/api/prices/refresh", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [symbol] })
      });

      const res = await fetch(`/api/assets?query=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      if (!res.ok) {
        failedSymbolsRef.current.add(symbol);
        return false;
      }

      const rows = (await res.json()) as Option[];
      const found = rows.find((item) => item.symbol === symbol);
      if (found) {
        upsertAsset(found);
        const hasValidPrice = Number(found.last_price ?? 0) > 0;
        if (!hasValidPrice) {
          failedSymbolsRef.current.add(symbol);
          return false;
        }
        failedSymbolsRef.current.delete(symbol);
        return true;
      }

      failedSymbolsRef.current.add(symbol);
      return false;
    } catch {
      failedSymbolsRef.current.add(symbol);
      return false;
    } finally {
      refreshInFlightRef.current = false;
      setMarketRefreshing(false);
    }
  }

  useEffect(() => {
    if (!open || !selectedSymbol) {
      return;
    }

    const current = assetsState.find((asset) => asset.symbol === selectedSymbol);
    if (
      !current ||
      current.type !== "crypto" ||
      (Number(current.last_price ?? 0) > 0 && !isPriceOlderThan30Minutes(current))
    ) {
      return;
    }
    if (Number(current.last_price ?? 0) > 0) {
      return;
    }
    if (!current.coingecko_id && !current.provider_id) {
      return;
    }
    if (failedSymbolsRef.current.has(selectedSymbol)) {
      return;
    }

    void refreshSelectedAssetPrice(selectedSymbol);
  }, [open, selectedSymbol]);

  function resetForm(nextAccounts: Option[]) {
    setTradeTab("BUY");
    setForm({
      datetime: toLocalDateTimeInput(new Date()),
      account_id: getDefaultAccountId(nextAccounts),
      asset_symbol: "",
      quantity: "",
      price: "",
      fee_amount: "",
      fee_currency: "USD",
      notes: ""
    });
    setAdvancedOpen(false);
    setSubmitted(false);
    setTouched({});
    setSubmitError("");
    setAccountsFetchError("");
  }

  async function refreshAccountsOnOpen() {
    setAccountsLoading(true);
    setAccountsFetchError("");

    try {
      const res = await fetch("/api/accounts", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setAccountsFetchError(body?.error || t("txModal.loadAccountsError", lang));
        return;
      }

      const freshAccounts = (await res.json()) as Option[];
      setAccountsState(freshAccounts);

      setForm((prev) => {
        if (initialTransaction) {
          return { ...prev, account_id: String(initialTransaction.account_id) };
        }

        return { ...prev, account_id: getDefaultAccountId(freshAccounts) };
      });
    } catch {
      setAccountsFetchError(t("txModal.loadAccountsUnexpected", lang));
    } finally {
      setAccountsLoading(false);
    }
  }

  function openModal() {
    if (isEditMode) {
      setForm(getInitialFormState(initialTransaction, accountsState, assets));
      setTradeTab(getTradeTabFromType(initialTransaction?.type));
      setAdvancedOpen(true);
      setSubmitted(false);
      setTouched({});
      setAccountsFetchError("");
      setSubmitError("");
    } else {
      resetForm(accountsState);
    }
    setOpen(true);
    void refreshAccountsOnOpen();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    if (formInvalid || loading) {
      return;
    }

    if (!selectedAsset) {
      setSubmitError(t("txModal.selectAsset", lang));
      return;
    }

    setLoading(true);
    setSubmitError("");

    try {
      const payload = {
        datetime: new Date(form.datetime).toISOString(),
        type: tradeTab === "SELL" ? "SELL" : "BUY",
        accountId: Number(form.account_id),
        assetSymbol: selectedAsset.symbol,
        quantity: quantityNum,
        price: priceNum,
        feeAmount: feeNum,
        feeCurrency: form.fee_currency,
        notes: form.notes || null
      };

      const endpoint = isEditMode ? `/api/transactions/${initialTransaction?.id}` : "/api/transactions";
      const method = isEditMode ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setSubmitError(body?.error || (isEditMode ? t("txModal.submitUnexpectedUpdate", lang) : t("txModal.submitUnexpectedCreate", lang)));
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setSubmitError(isEditMode ? t("txModal.submitUnexpectedUpdate", lang) : t("txModal.submitUnexpectedCreate", lang));
    } finally {
      setLoading(false);
    }
  }

  const feeCurrencyOptions = Array.from(
    new Set(["USD", ...assetsState.map((asset) => asset.symbol ?? "").filter(Boolean)])
  );
  if (!open) {
    return (
      <button
        onClick={openModal}
        disabled={triggerDisabled}
        className={
          triggerClassName ||
          "btn-primary disabled:opacity-50"
        }
      >
        {triggerContent || t("transactions.new", lang)}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/40 p-0 md:flex md:items-center md:justify-center md:p-4">
      <div className="flex h-[100dvh] w-full flex-col bg-slate-50 md:h-auto md:max-h-[calc(100vh-32px)] md:max-w-3xl md:rounded-3xl md:shadow-2xl">
        <div className="relative shrink-0 border-b border-slate-200 px-5 py-4 md:px-8 md:py-6">
          <h2 className="text-xl font-semibold tracking-tight">
            {isEditMode ? t("txModal.editTitle", lang) : t("txModal.createTitle", lang)}
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="absolute right-5 top-5 text-sm text-slate-500 hover:text-slate-700 md:right-8 md:top-6"
          >
            {t("txModal.close", lang)}
          </button>
        </div>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
          <main className="flex-1 space-y-6 overflow-y-auto px-5 py-4 pb-24 md:px-8">
            <TransactionTypeTabs
              value={tradeTab}
              onChange={(tab) => {
                if (tab === "TRANSFER") {
                  return;
                }
                setTradeTab(tab);
              }}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
                <AssetPicker
                  assets={pickerAssets}
                  selectedSymbol={form.asset_symbol}
                  onSelect={(symbol) => {
                    setForm({ ...form, asset_symbol: symbol });
                    markTouched("asset_symbol");
                  }}
                  onAssetResolved={(asset) => upsertAsset(asset)}
                  error={shouldShowError("asset_symbol") ? errors.asset_symbol : undefined}
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
                <label className="label-xs mb-3 block">
                  {t("txModal.account", lang)}
                </label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition-all focus:ring-2 focus:ring-slate-300"
                  value={form.account_id}
                  onChange={(e) => {
                    setForm({ ...form, account_id: e.target.value });
                    markTouched("account_id");
                  }}
                >
                  <option value="">{t("txModal.selectAccount", lang)}</option>
                  {accountsState.map((account) => (
                    <option key={account.id} value={account.id}>
                      {formatAccountOptionLabel(account)}
                    </option>
                  ))}
                </select>
                {shouldShowError("account_id") && errors.account_id ? (
                  <p className="mt-1 text-xs text-rose-600">{errors.account_id}</p>
                ) : null}
                {accountsFetchError ? <p className="mt-1 text-xs text-rose-600">{accountsFetchError}</p> : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <div className="min-h-[220px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
                <label className="mb-4 flex items-center justify-between gap-2 text-lg font-semibold tracking-tight text-slate-800">
                  <span className="inline-flex items-center gap-2">{t("txModal.amount", lang)}</span>
                  <span className="text-sm font-medium text-slate-500">{selectedAsset?.symbol || t("assetPicker.asset", lang)}</span>
                </label>
                <input
                  className="w-full overflow-hidden border-b-2 border-slate-200 bg-transparent px-0 py-3 text-center text-5xl font-semibold outline-none transition-all duration-200 focus:border-slate-900"
                  type="number"
                  step="any"
                  placeholder="0"
                  value={form.quantity}
                  onChange={(e) => {
                    setForm({ ...form, quantity: e.target.value });
                    markTouched("quantity");
                  }}
                />
                <p className="mt-3 text-center text-xs text-slate-500">≈ {formatMoney(subtotal)} USD</p>
                {shouldShowError("quantity") && errors.quantity ? (
                  <p className="mt-2 text-xs text-rose-600">{errors.quantity}</p>
                ) : null}
              </div>

              <div className="min-h-[220px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-lg font-semibold tracking-tight text-slate-800">{t("txModal.pricePerCoin", lang)}</div>
                  <button
                    type="button"
                    onClick={() => {
                      if (marketPrice > 0) {
                        setForm({ ...form, price: String(marketPrice) });
                        markTouched("price");
                      }
                    }}
                    disabled={marketPrice <= 0 || marketRefreshing}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition-all disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {t("txModal.useMarket", lang)}
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="mb-2 text-xs text-slate-500">USD</p>
                  <input
                    className="w-full border-b-2 border-slate-200 bg-transparent px-0 py-2 text-2xl font-semibold outline-none transition-all duration-200 focus:border-slate-900"
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={form.price}
                    onChange={(e) => {
                      setForm({ ...form, price: e.target.value });
                      markTouched("price");
                    }}
                    />
                </div>
                {form.asset_symbol && marketPrice > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">Market: {formatMoney(marketPrice)}</p>
                ) : null}
                {form.asset_symbol && !marketPrice ? (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-xs text-slate-400">
                      {selectedAssetDetails?.coingecko_id || selectedAssetDetails?.provider_id
                        ? t("txModal.providerIssue", lang)
                        : t("txModal.noProviderId", lang)}
                    </p>
                    {hasProviderId ? (
                      <button
                        type="button"
                        onClick={() => {
                          const symbol = form.asset_symbol;
                          if (!symbol || marketRefreshing) {
                            return;
                          }
                          void refreshSelectedAssetPrice(symbol, { manual: true });
                        }}
                        disabled={marketRefreshing}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {marketRefreshing ? t("dashboard.refreshing", lang) : t("txModal.refreshPrice", lang)}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {submitted && errors.price ? (
                  <p className="mt-2 text-xs text-rose-600">{errors.price}</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-8">
              <div className="grid grid-cols-1 gap-2 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>{t("txModal.subtotal", lang)}</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("transactions.worth", lang)}</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("txModal.fee", lang)}</span>
                  <span>{formatMoney(feeNum)}</span>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="text-xs text-slate-500">{t("txModal.total", lang)}</div>
                <div className="text-3xl font-bold text-slate-900">{formatMoney(total)}</div>
              </div>
            </div>

            <CollapsibleSection
              title={t("txModal.advanced", lang)}
              open={advancedOpen}
              onToggle={() => setAdvancedOpen((value) => !value)}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-semibold text-slate-900">
                    {t("txModal.fee", lang)}
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
                      type="number"
                      step="any"
                      placeholder="0"
                      value={form.fee_amount}
                      onChange={(e) => {
                        setForm({ ...form, fee_amount: e.target.value });
                        markTouched("fee_amount");
                      }}
                    />
                    <select
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={form.fee_currency}
                      onChange={(e) => {
                        setForm({ ...form, fee_currency: e.target.value });
                        markTouched("fee_currency");
                      }}
                    >
                      {feeCurrencyOptions.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                  {shouldShowError("fee_amount") && errors.fee_amount ? (
                    <p className="mt-1 text-xs text-rose-600">{errors.fee_amount}</p>
                  ) : null}
                  {shouldShowError("fee_currency") && errors.fee_currency ? (
                    <p className="mt-1 text-xs text-rose-600">{errors.fee_currency}</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-900">
                    {t("txModal.datetime", lang)}
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    type="datetime-local"
                    value={form.datetime}
                    onChange={(e) => {
                      setForm({ ...form, datetime: e.target.value });
                      markTouched("datetime");
                    }}
                  />
                  {shouldShowError("datetime") && errors.datetime ? (
                    <p className="mt-1 text-xs text-rose-600">{errors.datetime}</p>
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-semibold text-slate-900">
                    {t("txModal.notes", lang)}
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    rows={3}
                    placeholder={t("txModal.optional", lang)}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
            </CollapsibleSection>

            {submitError ? <p className="text-sm text-rose-600">{submitError}</p> : null}
          </main>

          <footer className="sticky bottom-0 shrink-0 border-t border-slate-200 bg-slate-50/90 p-4 backdrop-blur md:px-8">
            <button
              type="submit"
              disabled={formInvalid || loading || accountsLoading}
              className="w-full rounded-full bg-indigo-600 px-6 py-4 text-base font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {loading
                ? isEditMode
                  ? t("txModal.submittingUpdate", lang)
                  : t("txModal.submittingCreate", lang)
                : isEditMode
                  ? t("txModal.submitUpdate", lang)
                  : t("txModal.submitCreate", lang)}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

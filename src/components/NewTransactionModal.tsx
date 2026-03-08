"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { AssetPicker } from "@/components/AssetPicker";
import { TransactionTypeTabs, type TradeTab } from "@/components/TransactionTypeTabs";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { computeTransactionPreview } from "@/lib/transaction-math";

interface Option {
  id?: number;
  symbol?: string;
  name: string;
  type?: "crypto" | "stock";
  asset_class?: "crypto" | "stock";
  kind?: string;
  base_currency?: string;
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
  quote_asset_symbol?: string | null;
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
  quote_asset_symbol: string;
  quantity: string;
  price: string;
  fee_amount: string;
  fee_currency: string;
  notes: string;
}

interface CreateAccountFormState {
  name: string;
  kind: "exchange" | "fiat";
  baseCurrency: string;
}

interface AccountSummaryHolding {
  symbol: string;
  qty: number;
}

interface AccountSummaryRow {
  accountId: number;
  holdings?: AccountSummaryHolding[];
}

type FieldKey =
  | "asset_symbol"
  | "quote_asset_symbol"
  | "account_id"
  | "price"
  | "quantity"
  | "fee_amount"
  | "fee_currency"
  | "datetime";

const SELL_QUOTE_OPTIONS = ["USDT", "USD", "USDC", "FDUSD"] as const;

function toLocalDateTimeInput(date: Date) {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function getDefaultAccountId(accounts: Option[]) {
  const defaultAccount = accounts.find((account) => account.is_default);
  if (defaultAccount?.id) {
    return String(defaultAccount.id);
  }

  if (accounts.length === 1 && accounts[0]?.id) {
    return String(accounts[0].id);
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

function formatQty(value: number, digits = 8) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0";
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
      quote_asset_symbol: "USD",
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
    quote_asset_symbol: initialTransaction.quote_asset_symbol || "USD",
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
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [createAccountLoading, setCreateAccountLoading] = useState(false);
  const [createAccountError, setCreateAccountError] = useState("");
  const [createAccountForm, setCreateAccountForm] = useState<CreateAccountFormState>({
    name: "",
    kind: "exchange",
    baseCurrency: "USD"
  });
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [accountsState, setAccountsState] = useState<Option[]>(accounts);
  const [assetsState, setAssetsState] = useState<Option[]>(assets);
  const [summaryByAccountId, setSummaryByAccountId] = useState<Record<number, AccountSummaryRow>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [marketRefreshing, setMarketRefreshing] = useState(false);
  const [tradeTab, setTradeTab] = useState<TradeTab>(getTradeTabFromType(initialTransaction?.type));
  const [form, setForm] = useState<FormState>(getInitialFormState(initialTransaction, accounts, assets));
  const refreshInFlightBySymbolRef = useRef<Record<string, boolean>>({});
  const lastRefreshBySymbolRef = useRef<Record<string, number>>({});
  const failedSymbolsRef = useRef<Set<string>>(new Set());
  const priceRefreshRequestIdRef = useRef(0);
  const previousSelectedSymbolRef = useRef<string | null>(null);

  const pickerAssets = assetsState
    .filter((asset): asset is { symbol: string; name: string; type: "crypto" | "stock" } =>
      Boolean(asset.symbol && asset.name && asset.type)
    );
  const selectedAsset = pickerAssets.find((asset) => asset.symbol === form.asset_symbol);
  const selectedSymbol = selectedAsset?.symbol ?? null;
  const selectedAssetDetails = assetsState.find((asset) => asset.symbol === form.asset_symbol);
  const selectedAccount = accountsState.find((account) => String(account.id) === form.account_id);
  const accountBaseCurrency = (selectedAccount?.base_currency || "USD").toUpperCase();
  const isSell = tradeTab === "SELL";
  const defaultSellQuote = selectedAccount?.kind === "fiat" ? "USD" : "USDT";
  const marketPrice = Number(selectedAssetDetails?.last_price ?? 0);
  const hasProviderId = Boolean(selectedAssetDetails?.coingecko_id || selectedAssetDetails?.provider_id);

  const quantityNum = Number(form.quantity || 0);
  const priceNum = Number(form.price || 0);
  const feeNum = Number(form.fee_amount || 0);
  const txPreview = computeTransactionPreview({
    type: tradeTab,
    assetSymbol: form.asset_symbol || selectedAsset?.symbol || "",
    quoteAssetSymbol: form.quote_asset_symbol || accountBaseCurrency,
    quantity: quantityNum,
    price: priceNum,
    feeAmount: feeNum,
    feeCurrency: form.fee_currency,
    baseCurrency: accountBaseCurrency
  });
  const subtotal = txPreview.quantityGross * priceNum;
  const total = txPreview.cost;
  const selectedAccountSummary = form.account_id ? summaryByAccountId[Number(form.account_id)] : undefined;
  const availableBalance = useMemo(() => {
    if (!isSell || !selectedAsset?.symbol || !selectedAccountSummary?.holdings) {
      return null;
    }
    const row = selectedAccountSummary.holdings.find(
      (item) => String(item.symbol || "").toUpperCase() === selectedAsset.symbol.toUpperCase()
    );
    return row ? Number(row.qty || 0) : 0;
  }, [isSell, selectedAsset?.symbol, selectedAccountSummary?.holdings]);
  const insufficientSellBalance =
    isSell &&
    availableBalance != null &&
    Number(txPreview.quantityReduced || 0) > Number(availableBalance || 0) + 1e-12;

  const errors = useMemo(() => {
    const next: Record<string, string> = {};

    if (!form.asset_symbol || !selectedAsset) {
      next.asset_symbol = t("txModal.selectAsset", lang);
    }

    if (!form.quote_asset_symbol) {
      next.quote_asset_symbol = lang === "es" ? "Selecciona un quote asset." : "Select a quote asset.";
    }

    if (!(priceNum > 0)) {
      next.price = t("txModal.errorPrice", lang);
    }

    if (!(quantityNum > 0)) {
      next.quantity = t("txModal.errorAmount", lang);
    }
    if (insufficientSellBalance) {
      next.quantity =
        lang === "es"
          ? "Saldo insuficiente para este activo."
          : "Insufficient balance for this asset.";
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
    form.quote_asset_symbol,
    form.datetime,
    form.fee_currency,
    lang,
    priceNum,
    quantityNum,
    selectedAsset,
    insufficientSellBalance
  ]);

  const formInvalid = Object.keys(errors).length > 0;
  const sellBalancesByAccountId = useMemo(() => {
    if (!isSell || !selectedAsset?.symbol) {
      return {} as Record<number, number>;
    }
    const target = selectedAsset.symbol.toUpperCase();
    const out: Record<number, number> = {};
    for (const [accountIdRaw, summary] of Object.entries(summaryByAccountId)) {
      const accountId = Number(accountIdRaw);
      const holding = summary.holdings?.find((item) => String(item.symbol || "").toUpperCase() === target);
      if (holding && Number(holding.qty || 0) > 0) {
        out[accountId] = Number(holding.qty || 0);
      }
    }
    return out;
  }, [isSell, selectedAsset?.symbol, summaryByAccountId]);

  const eligibleSellAccounts = useMemo(() => {
    if (!isSell || !selectedAsset?.symbol) {
      return accountsState;
    }
    return accountsState
      .filter((account) => Number(sellBalancesByAccountId[Number(account.id)]) > 0)
      .sort((a, b) => Number(sellBalancesByAccountId[Number(b.id)]) - Number(sellBalancesByAccountId[Number(a.id)]));
  }, [isSell, selectedAsset?.symbol, accountsState, sellBalancesByAccountId]);

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

  useEffect(() => {
    if (!isSell) {
      return;
    }
    const currentQuote = String(form.quote_asset_symbol || "").toUpperCase();
    const isSupported = SELL_QUOTE_OPTIONS.includes(currentQuote as (typeof SELL_QUOTE_OPTIONS)[number]);
    if (
      isSupported &&
      !(currentQuote === "USD" && defaultSellQuote === "USDT" && !touched.quote_asset_symbol)
    ) {
      return;
    }
    setForm((prev) => ({ ...prev, quote_asset_symbol: defaultSellQuote }));
  }, [isSell, defaultSellQuote, form.quote_asset_symbol, touched.quote_asset_symbol]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = previousSelectedSymbolRef.current;
    const current = selectedSymbol ?? null;
    if (prev === current) {
      return;
    }
    previousSelectedSymbolRef.current = current;
    if (!prev || !current) {
      return;
    }

    // Reset stale price/worth context when switching asset.
    setForm((old) => ({ ...old, price: "" }));
  }, [open, selectedSymbol]);

  useEffect(() => {
    if (!isSell || !selectedAsset?.symbol) {
      return;
    }
    if (eligibleSellAccounts.length === 0) {
      if (form.account_id) {
        setForm((prev) => ({ ...prev, account_id: "" }));
      }
      return;
    }
    const selectedAccountId = Number(form.account_id || 0);
    const selectedValid = selectedAccountId > 0 && Number(sellBalancesByAccountId[selectedAccountId] || 0) > 0;
    if (!selectedValid) {
      setForm((prev) => ({ ...prev, account_id: String(eligibleSellAccounts[0].id ?? "") }));
    }
  }, [isSell, selectedAsset?.symbol, eligibleSellAccounts, sellBalancesByAccountId, form.account_id]);

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
    const normalized = symbol.toUpperCase();
    const manual = Boolean(options?.manual);
    const now = Date.now();
    const lastTs = lastRefreshBySymbolRef.current[normalized] ?? 0;

    if (refreshInFlightBySymbolRef.current[normalized]) {
      return false;
    }
    if (!manual && now - lastTs < 60_000) {
      return false;
    }
    if (!manual && failedSymbolsRef.current.has(normalized)) {
      return false;
    }

    refreshInFlightBySymbolRef.current[normalized] = true;
    lastRefreshBySymbolRef.current[normalized] = now;
    const requestId = ++priceRefreshRequestIdRef.current;
    setMarketRefreshing(true);

    try {
      await fetch("/api/prices/refresh", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [normalized] })
      });

      const res = await fetch(`/api/assets?query=${encodeURIComponent(normalized)}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) {
          return false;
        }
        failedSymbolsRef.current.add(normalized);
        return false;
      }

      const rows = (await res.json()) as Option[];
      const found = rows.find((item) => item.symbol === normalized);
      if (found) {
        if (requestId !== priceRefreshRequestIdRef.current) {
          return false;
        }
        upsertAsset(found);
        const hasValidPrice = Number(found.last_price ?? 0) > 0;
        if (!hasValidPrice) {
          failedSymbolsRef.current.add(normalized);
          return false;
        }
        failedSymbolsRef.current.delete(normalized);
        return true;
      }

      failedSymbolsRef.current.add(normalized);
      return false;
    } catch {
      failedSymbolsRef.current.add(normalized);
      return false;
    } finally {
      delete refreshInFlightBySymbolRef.current[normalized];
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
    if (failedSymbolsRef.current.has(selectedSymbol.toUpperCase())) {
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
      quote_asset_symbol: "USD",
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

        if (prev.account_id) {
          const stillExists = freshAccounts.some((account) => String(account.id) === prev.account_id);
          if (stillExists) {
            return prev;
          }
        }

        return { ...prev, account_id: getDefaultAccountId(freshAccounts) };
      });
    } catch {
      setAccountsFetchError(t("txModal.loadAccountsUnexpected", lang));
    } finally {
      setAccountsLoading(false);
    }
  }

  async function refreshAccountSummaries() {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/accounts/summary?includeHoldings=1", { cache: "no-store" });
      if (!res.ok) {
        setSummaryByAccountId({});
        return;
      }
      const body = (await res.json()) as { accounts?: AccountSummaryRow[] };
      const byId: Record<number, AccountSummaryRow> = {};
      for (const account of body.accounts || []) {
        byId[Number(account.accountId)] = account;
      }
      setSummaryByAccountId(byId);
    } catch {
      setSummaryByAccountId({});
    } finally {
      setSummaryLoading(false);
    }
  }

  async function createAccountInline() {
    if (!createAccountForm.name.trim() || createAccountLoading) {
      return;
    }

    setCreateAccountLoading(true);
    setCreateAccountError("");
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createAccountForm.name.trim(),
          kind: createAccountForm.kind,
          baseCurrency: createAccountForm.baseCurrency.trim().toUpperCase() || "USD"
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setCreateAccountError(body?.error || "Could not create account");
        return;
      }

      const created = (await res.json()) as Option;
      setCreateAccountOpen(false);
      setCreateAccountForm({
        name: "",
        kind: "exchange",
        baseCurrency: "USD"
      });

      await refreshAccountsOnOpen();
      await refreshAccountSummaries();
      if (created?.id) {
        setForm((prev) => ({
          ...prev,
          account_id: String(created.id)
        }));
        markTouched("account_id");
      }
    } catch {
      setCreateAccountError("Could not create account");
    } finally {
      setCreateAccountLoading(false);
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
    void refreshAccountSummaries();
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
        quoteAssetSymbol: form.quote_asset_symbol,
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
                {accountsLoading ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    {lang === "es" ? "Cargando cuentas..." : "Loading accounts..."}
                  </div>
                ) : accountsFetchError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {lang === "es" ? "No se pudieron cargar las cuentas" : "Could not load accounts"}
                  </div>
                ) : accountsState.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-center">
                    <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500">
                      +
                    </div>
                    <p className="text-sm font-semibold text-slate-800">
                      {lang === "es" ? "Aun no tienes cuentas" : "No accounts yet"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {lang === "es"
                        ? "Crea tu primera cuenta para comenzar a registrar trades."
                        : "Create your first account to start tracking trades."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateAccountError("");
                        setCreateAccountOpen(true);
                      }}
                      className="mt-4 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {lang === "es" ? "Crear cuenta" : "Create account"}
                    </button>
                  </div>
                ) : isSell && selectedAsset?.symbol && eligibleSellAccounts.length === 0 ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                    {lang === "es" ? "Ninguna cuenta tiene este activo." : "No account holds this asset."}
                  </div>
                ) : (
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition-all focus:ring-2 focus:ring-slate-300"
                    value={form.account_id}
                    onChange={(e) => {
                      setForm({ ...form, account_id: e.target.value });
                      markTouched("account_id");
                    }}
                  >
                    <option value="">{t("txModal.selectAccount", lang)}</option>
                    {(isSell && selectedAsset?.symbol ? eligibleSellAccounts : accountsState).map((account) => {
                      const accountId = Number(account.id || 0);
                      const sellBalance = sellBalancesByAccountId[accountId];
                      const suffix =
                        isSell && selectedAsset?.symbol && Number(sellBalance || 0) > 0
                          ? ` — ${formatQty(Number(sellBalance || 0), 6)} ${selectedAsset.symbol}`
                          : "";
                      return (
                        <option key={account.id} value={account.id}>
                          {formatAccountOptionLabel(account)}
                          {suffix}
                        </option>
                      );
                    })}
                  </select>
                )}
                {shouldShowError("account_id") && errors.account_id ? (
                  <p className="mt-1 text-xs text-rose-600">{errors.account_id}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <div
                className={`min-h-[220px] overflow-hidden rounded-2xl border bg-white p-4 shadow-sm md:p-8 ${
                  isSell ? "border-rose-200" : "border-slate-200"
                }`}
              >
                <label className="mb-4 flex items-center justify-between gap-2 text-lg font-semibold tracking-tight text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    {t("transaction.grossAmount", lang)}
                    {isSell ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                        SELL
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm font-medium text-slate-500">{selectedAsset?.symbol || t("assetPicker.asset", lang)}</span>
                </label>
                <input
                  className={`w-full overflow-hidden border-b-2 bg-transparent px-0 py-3 text-center text-5xl font-semibold outline-none transition-all duration-200 ${
                    isSell ? "border-rose-200 focus:border-rose-600" : "border-slate-200 focus:border-slate-900"
                  }`}
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

            {isSell ? (
              <div className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm md:p-6">
                <label className="mb-2 block text-sm font-semibold text-slate-900">{t("transaction.receiveIn", lang)}</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition-all focus:ring-2 focus:ring-rose-200"
                  value={form.quote_asset_symbol}
                  onChange={(e) => {
                    setForm({ ...form, quote_asset_symbol: e.target.value.toUpperCase() });
                    markTouched("quote_asset_symbol");
                  }}
                >
                  {SELL_QUOTE_OPTIONS.map((currency) => (
                    <option key={`sell-quote-${currency}`} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SELL_QUOTE_OPTIONS.map((currency) => {
                    const active = form.quote_asset_symbol.toUpperCase() === currency;
                    return (
                      <button
                        key={`sell-chip-${currency}`}
                        type="button"
                        onClick={() => {
                          setForm({ ...form, quote_asset_symbol: currency });
                          markTouched("quote_asset_symbol");
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "border-rose-300 bg-rose-100 text-rose-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {currency}
                      </button>
                    );
                  })}
                </div>
                {shouldShowError("quote_asset_symbol") && errors.quote_asset_symbol ? (
                  <p className="mt-2 text-xs text-rose-600">{errors.quote_asset_symbol}</p>
                ) : null}
                <p className="mt-3 text-xs text-slate-500">
                  {summaryLoading
                    ? lang === "es"
                      ? "Consultando saldo..."
                      : "Loading balance..."
                    : `${lang === "es" ? "Disponible" : "Available"}: ${formatQty(Number(availableBalance || 0), 8)} ${
                      selectedAsset?.symbol || ""
                    }`}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[0.25, 0.5, 0.75, 1].map((ratio) => (
                    <button
                      key={`sell-ratio-${ratio}`}
                      type="button"
                      onClick={() => {
                        const max = Number(availableBalance || 0);
                        const nextQty = ratio === 1 ? max : max * ratio;
                        setForm((prev) => ({
                          ...prev,
                          quantity: max > 0 ? String(Number(nextQty.toFixed(8))) : ""
                        }));
                        markTouched("quantity");
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {ratio === 1 ? "MAX" : `${Math.round(ratio * 100)}%`}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={`rounded-2xl border bg-white p-4 shadow-sm md:p-8 ${isSell ? "border-rose-200" : "border-slate-200"}`}>
              <div className="grid grid-cols-1 gap-2 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>{isSell ? t("transaction.youSell", lang) : t("transaction.youReceive", lang)}</span>
                  <span>
                    {formatQty(isSell ? txPreview.quantityGross : txPreview.quantityNet, 8)} {selectedAsset?.symbol || ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{isSell ? t("transaction.youReceive", lang) : t("transaction.youSpend", lang)}</span>
                  <span>{formatQty(Math.abs(txPreview.quoteDelta), 6)} {txPreview.quoteAssetSymbol || form.quote_asset_symbol}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{isSell ? t("transaction.netProceeds", lang) : "Cost"}</span>
                  <span>{formatMoney(txPreview.cost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{lang === "es" ? "Worth at transaction" : "Worth at transaction"}</span>
                  <span>{formatMoney(txPreview.worthAtTransaction)}</span>
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
                {!isSell ? (
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-semibold text-slate-900">
                      {t("transaction.quoteAsset", lang)}
                    </label>
                    <select
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={form.quote_asset_symbol}
                      onChange={(e) => {
                        setForm({ ...form, quote_asset_symbol: e.target.value.toUpperCase() });
                        markTouched("quote_asset_symbol");
                      }}
                    >
                      {feeCurrencyOptions.map((currency) => (
                        <option key={`quote-${currency}`} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                    {shouldShowError("quote_asset_symbol") && errors.quote_asset_symbol ? (
                      <p className="mt-1 text-xs text-rose-600">{errors.quote_asset_symbol}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-semibold text-slate-900">
                    {lang === "es" ? "Fee Currency" : "Fee Currency"}
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
            {!form.account_id ? (
              <p className="text-xs text-slate-500">
                {lang === "es" ? "Crea una cuenta para registrar tu primer trade." : "Create an account to record your first trade."}
              </p>
            ) : null}
          </main>

          <footer className="sticky bottom-0 shrink-0 border-t border-slate-200 bg-slate-50/90 p-4 backdrop-blur md:px-8">
            <button
              type="submit"
              disabled={formInvalid || loading || accountsLoading || insufficientSellBalance}
              className={`w-full rounded-full px-6 py-4 text-base font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${
                isSell ? "bg-rose-600 hover:bg-rose-500" : "bg-indigo-600 hover:bg-indigo-500"
              }`}
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

        {createAccountOpen ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900">{lang === "es" ? "Crear cuenta" : "Create account"}</h3>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-800">{lang === "es" ? "Nombre" : "Name"}</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Binance"
                    value={createAccountForm.name}
                    onChange={(e) => setCreateAccountForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-800">{lang === "es" ? "Tipo" : "Type"}</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={createAccountForm.kind}
                    onChange={(e) =>
                      setCreateAccountForm((prev) => ({ ...prev, kind: e.target.value as "exchange" | "fiat" }))
                    }
                  >
                    <option value="exchange">{lang === "es" ? "Exchange" : "Exchange"}</option>
                    <option value="fiat">{lang === "es" ? "Fiat" : "Fiat"}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-800">{lang === "es" ? "Moneda base" : "Base currency"}</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={createAccountForm.baseCurrency}
                    onChange={(e) => setCreateAccountForm((prev) => ({ ...prev, baseCurrency: e.target.value.toUpperCase() }))}
                  />
                </div>
                {createAccountError ? <p className="text-xs text-rose-600">{createAccountError}</p> : null}
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateAccountOpen(false)}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  {lang === "es" ? "Cancelar" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => void createAccountInline()}
                  disabled={createAccountLoading || !createAccountForm.name.trim()}
                  className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {createAccountLoading ? (lang === "es" ? "Creando..." : "Creating...") : lang === "es" ? "Crear cuenta" : "Create account"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Toast } from "@/components/Toast";
import { AdsCarousel } from "@/components/AdsCarousel";
import { AssetIcon } from "@/components/AssetIcon";
import { useLanguage } from "@/components/LanguageProvider";
import { formatMoney, formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { usePrices } from "@/lib/prices-store";

const accountKinds = ["exchange", "fiat"] as const;

type AccountKind = (typeof accountKinds)[number];

interface Account {
  id: number;
  name: string;
  kind: AccountKind;
  base_currency: string;
  notes: string | null;
  is_default: boolean;
  created_at: string;
}

interface AccountFormState {
  name: string;
  kind: AccountKind;
  base_currency: string;
  notes: string;
  is_default: boolean;
}

interface AccountHoldingRow {
  symbol: string;
  name: string;
  qty: number;
  avgCost: number;
  cost: number;
  lastPriceUsd: number | null;
  worthLive: number | null;
  pnl: number | null;
  pnlPct: number | null;
}

interface AccountSummaryRow {
  accountId: number;
  costTotal: number;
  worthTotal: number | null;
  pnlTotal: number | null;
  pnlPctTotal: number | null;
  holdingsCount: number;
  topHoldings: Array<{
    symbol: string;
    name: string;
    qty: number;
    worthLive: number | null;
    cost: number;
  }>;
  holdings?: AccountHoldingRow[];
}

interface AccountModalProps {
  open: boolean;
  loading: boolean;
  initialAccount?: Account | null;
  onClose: () => void;
  onSubmit: (payload: AccountFormState) => Promise<void>;
}

function kindLabel(kind: AccountKind) {
  return kind === "fiat" ? "Fiat" : "Exchange";
}

function kindShort(kind: AccountKind) {
  return kind === "fiat" ? "Fiat" : "Exchange";
}

function kindChipClass(kind: AccountKind) {
  if (kind === "fiat") {
    return "bg-[color:rgba(22,163,74,0.12)] text-[color:var(--success)]";
  }
  return "bg-[color:rgba(79,85,241,0.12)] text-[color:var(--brand-500)]";
}

function pnlTextClass(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "text-[color:var(--muted)]";
  }
  if (value > 0) {
    return "text-[color:var(--success)]";
  }
  if (value < 0) {
    return "text-[color:var(--danger)]";
  }
  return "text-[color:var(--muted)]";
}

function formatAsOfAgo(value: string | null) {
  if (!value) {
    return "—";
  }
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) {
    return "—";
  }
  const delta = Date.now() - ts;
  if (delta < 15_000) {
    return "Updated just now";
  }
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) {
    return `Updated ${seconds}s ago`;
  }
  const mins = Math.floor(seconds / 60);
  return `Updated ${mins}m ago`;
}

function AccountModal({ open, loading, initialAccount, onClose, onSubmit }: AccountModalProps) {
  const { lang } = useLanguage();
  const isEdit = Boolean(initialAccount);
  const [form, setForm] = useState<AccountFormState>({
    name: "",
    kind: "exchange",
    base_currency: "USD",
    notes: "",
    is_default: false
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    if (initialAccount) {
      setForm({
        name: initialAccount.name,
        kind: initialAccount.kind,
        base_currency: initialAccount.base_currency,
        notes: initialAccount.notes || "",
        is_default: initialAccount.is_default
      });
      return;
    }

    setForm({
      name: "",
      kind: "exchange",
      base_currency: "USD",
      notes: "",
      is_default: false
    });
  }, [open, initialAccount]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="card w-full max-w-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ink-900)]">
            {isEdit ? t("accounts.edit", lang) : t("accounts.new", lang)}
          </h2>
          <button onClick={onClose} className="btn-secondary">
            {t("accounts.close", lang)}
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit(form);
          }}
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-[color:var(--ink-900)]">{t("accounts.name", lang)}</label>
            <input
              className="input-ui w-full rounded-xl"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[color:var(--ink-900)]">{t("accounts.type", lang)}</label>
              <select
                className="input-ui w-full rounded-xl"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as AccountKind })}
              >
                {accountKinds.map((kindEnum) => (
                  <option key={kindEnum} value={kindEnum}>
                    {kindLabel(kindEnum)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[color:var(--ink-900)]">{t("accounts.baseCurrency", lang)}</label>
              <input
                className="input-ui w-full rounded-xl"
                value={form.base_currency}
                onChange={(e) => setForm({ ...form, base_currency: e.target.value.toUpperCase() })}
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[color:var(--ink-900)]">{t("accounts.notes", lang)}</label>
            <textarea
              className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-400)] focus:ring-2 focus:ring-[color:rgba(79,85,241,0.2)]"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t("accounts.optional", lang)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
            />
            {t("accounts.defaultCheckbox", lang)}
          </label>

          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
            {loading ? t("accounts.saving", lang) : isEdit ? t("accounts.saveChanges", lang) : t("accounts.create", lang)}
          </button>
        </form>
      </div>
    </div>
  );
}

export function AccountsManager() {
  const { lang } = useLanguage();
  const { pricesMap, status: pricesStatus, lastUpdated, loadOnce, refresh } = usePrices();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summaryByAccountId, setSummaryByAccountId] = useState<Record<number, AccountSummaryRow>>({});
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");
  const [defaultLoading, setDefaultLoading] = useState(false);
  const [defaultError, setDefaultError] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [expandedAccountIds, setExpandedAccountIds] = useState<number[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function showToast(message: string) {
    setToastMessage(message);
    setToastVisible(true);
  }

  async function loadAccounts() {
    setLoading(true);
    setSummaryLoading(true);
    setError("");

    try {
      const [accountsRes, summaryRes] = await Promise.all([
        fetch("/api/accounts", { cache: "no-store" }),
        fetch("/api/accounts/summary?includeHoldings=1", { cache: "no-store" })
      ]);

      if (!accountsRes.ok) {
        const body = await accountsRes.json().catch(() => null);
        setError(body?.error || t("dashboard.errorLoad", lang));
        return;
      }

      const accountsData = (await accountsRes.json()) as Account[];
      setAccounts(accountsData);

      if (!summaryRes.ok) {
        setSummaryByAccountId({});
        return;
      }

      const summaryBody = (await summaryRes.json()) as { accounts?: AccountSummaryRow[] };
      const nextSummary: Record<number, AccountSummaryRow> = {};
      for (const item of summaryBody.accounts || []) {
        nextSummary[item.accountId] = item;
      }
      setSummaryByAccountId(nextSummary);
    } catch {
      setError(t("dashboard.errorLoad", lang));
    } finally {
      setLoading(false);
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    void loadOnce();
  }, [loadOnce]);

  useEffect(() => {
    if (!toastVisible) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setToastVisible(false);
    }, 2500);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [toastVisible]);

  async function onSaveAccount(payload: AccountFormState) {
    const isEditing = Boolean(editing);
    setSaving(true);
    setSaveError("");

    try {
      const endpoint = editing ? `/api/accounts/${editing.id}` : "/api/accounts";
      const method = editing ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? {
                name: payload.name,
                kind: payload.kind,
                baseCurrency: payload.base_currency,
                notes: payload.notes || null,
                is_default: payload.is_default
              }
            : {
                name: payload.name,
                kind: payload.kind,
                baseCurrency: payload.base_currency,
                notes: payload.notes || null,
                ...(payload.is_default ? { is_default: true } : {})
              }
        )
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setSaveError(body?.error || "Failed to save account.");
        return;
      }

      setModalOpen(false);
      setEditing(null);
      await loadAccounts();
      showToast(isEditing ? (lang === "es" ? "Cuenta actualizada" : "Account updated") : (lang === "es" ? "Cuenta creada" : "Account created"));
    } catch {
      setSaveError("Unexpected error while saving account.");
    } finally {
      setSaving(false);
    }
  }

  async function onSetDefault(account: Account) {
    if (account.is_default || defaultLoading) {
      return;
    }

    const previous = accounts;
    setDefaultLoading(true);
    setDefaultError("");
    setAccounts((current) =>
      current.map((item) => ({
        ...item,
        is_default: item.id === account.id
      }))
    );

    try {
      const res = await fetch(`/api/accounts/${account.id}/set-default`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setDefaultError(body?.error || "Could not update default account.");
        setAccounts(previous);
        return;
      }

      const data = (await res.json()) as { defaultAccountId: number | null };
      if (typeof data.defaultAccountId === "number") {
        setAccounts((current) =>
          current.map((item) => ({
            ...item,
            is_default: item.id === data.defaultAccountId
          }))
        );
      }
      showToast(lang === "es" ? "Cuenta por defecto actualizada" : "Default account updated");
    } catch {
      setDefaultError("Unexpected error while updating default account.");
      setAccounts(previous);
    } finally {
      setDefaultLoading(false);
    }
  }

  async function onDeleteAccount() {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    setDeleteError("");

    try {
      const res = await fetch(`/api/accounts/${deleteTarget.id}`, {
        method: "DELETE",
        cache: "no-store"
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setDeleteError(body?.error || "Failed to delete account.");
        return;
      }

      setDeleteTarget(null);
      await loadAccounts();
      showToast(lang === "es" ? "Cuenta eliminada" : "Account deleted");
    } catch {
      setDeleteError("Unexpected error while deleting account.");
    } finally {
      setDeleting(false);
    }
  }

  const computedSummaryByAccountId = useMemo(() => {
    const next: Record<number, AccountSummaryRow> = {};

    for (const [accountIdStr, summary] of Object.entries(summaryByAccountId)) {
      const accountId = Number(accountIdStr);
      const baseHoldings = summary.holdings || [];
      const holdings = baseHoldings
        .map((holding) => {
          const symbol = String(holding.symbol || "").toUpperCase();
          const marketPrice = pricesMap[symbol];
          const hasMarketPrice = Number.isFinite(marketPrice) && marketPrice > 0;
          const worthLive = hasMarketPrice ? Number(holding.qty || 0) * marketPrice : null;
          const pnl = worthLive == null ? null : worthLive - Number(holding.cost || 0);
          const pnlPct = pnl == null || Number(holding.cost || 0) <= 0 ? null : (pnl / Number(holding.cost || 0)) * 100;

          return {
            ...holding,
            lastPriceUsd: hasMarketPrice ? marketPrice : null,
            worthLive,
            pnl,
            pnlPct
          };
        })
        .filter((holding) => Number(holding.qty || 0) > 0)
        .sort((a, b) => Number(b.worthLive ?? -1) - Number(a.worthLive ?? -1));

      const costTotal = holdings.reduce((sum, holding) => sum + Number(holding.cost || 0), 0);
      const hasMissingLivePrice = holdings.some((holding) => holding.worthLive == null);
      const worthTotal = hasMissingLivePrice ? null : holdings.reduce((sum, holding) => sum + Number(holding.worthLive || 0), 0);
      const pnlTotal = worthTotal == null ? null : worthTotal - costTotal;
      const pnlPctTotal = pnlTotal == null || costTotal <= 0 ? null : (pnlTotal / costTotal) * 100;

      next[accountId] = {
        ...summary,
        costTotal,
        worthTotal,
        pnlTotal,
        pnlPctTotal,
        holdingsCount: holdings.length,
        topHoldings: holdings.slice(0, 3).map((holding) => ({
          symbol: holding.symbol,
          name: holding.name,
          qty: holding.qty,
          worthLive: holding.worthLive,
          cost: holding.cost
        })),
        holdings
      };
    }

    return next;
  }, [summaryByAccountId, pricesMap]);

  const hasAccounts = useMemo(() => accounts.length > 0, [accounts]);

  function toggleExpand(accountId: number) {
    setExpandedAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-5 md:space-y-6">
      <Toast message={toastMessage} visible={toastVisible} />

      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[color:var(--ink-900)]">{t("accounts.title", lang)}</h1>
            <p className="text-sm text-[color:var(--muted)]">{t("accounts.subtitle", lang)}</p>
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
              className="btn-secondary"
              disabled={pricesStatus === "loading"}
            >
              {pricesStatus === "loading" ? t("dashboard.refreshing", lang) : t("dashboard.refresh", lang)}
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setSaveError("");
                setModalOpen(true);
              }}
              className="btn-primary"
            >
              {t("accounts.new", lang)}
            </button>
          </div>
        </div>

        <AdsCarousel page="accounts" />

        {error ? <p className="text-sm text-[color:var(--danger)]">{error}</p> : null}
        {saveError ? <p className="text-sm text-[color:var(--danger)]">{saveError}</p> : null}
        {defaultError ? <p className="text-sm text-[color:var(--danger)]">{defaultError}</p> : null}
        <p className="text-xs text-[color:var(--muted)]">{formatAsOfAgo(lastUpdated ? lastUpdated.toISOString() : null)}</p>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-left text-xs uppercase tracking-wider text-[color:var(--muted)]">
                <th className="px-4 py-3">{t("accounts.name", lang)}</th>
                <th className="px-4 py-3">{t("accounts.type", lang)}</th>
                <th className="px-4 py-3">{t("accounts.baseCurrency", lang)}</th>
                <th className="px-4 py-3">Cost (Avg)</th>
                <th className="px-4 py-3">Worth (Live)</th>
                <th className="px-4 py-3">PnL</th>
                <th className="px-4 py-3">{t("accounts.holdings", lang)}</th>
                <th className="px-4 py-3">{t("accounts.default", lang)}</th>
                <th className="px-4 py-3">{t("accounts.actions", lang)}</th>
                <th className="px-4 py-3 text-right">{t("accounts.expand", lang)}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const summary = computedSummaryByAccountId[account.id];
                const expanded = expandedAccountIds.includes(account.id);
                const holdings = summary?.holdings || [];
                const topHoldings = summary?.topHoldings || [];

                return (
                  <Fragment key={account.id}>
                    <tr
                      className={`h-16 border-b border-[color:var(--border)] hover:bg-[color:var(--bg-50)] ${
                        account.is_default ? "bg-[color:rgba(79,85,241,0.06)]" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-[color:var(--ink-900)]">{account.name}</div>
                        <div className="text-xs text-[color:var(--muted)]">
                          {kindShort(account.kind)} • {account.base_currency}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${kindChipClass(account.kind)}`}>
                          {kindShort(account.kind)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-[color:var(--ink-900)]">{account.base_currency}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[color:var(--ink-900)]">
                        {summaryLoading ? "..." : formatMoney(Number(summary?.costTotal || 0))}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-[color:var(--ink-900)]">
                        {summaryLoading ? "..." : summary?.worthTotal == null ? "—" : formatMoney(Number(summary?.worthTotal || 0))}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {summaryLoading ? (
                          "..."
                        ) : summary?.pnlTotal == null ? (
                          <span className="text-[color:var(--muted)]">—</span>
                        ) : (
                          <div className={pnlTextClass(summary?.pnlTotal)}>
                            <div className="font-semibold">{formatMoney(Number(summary?.pnlTotal || 0))}</div>
                            <div className="text-xs">
                              {summary?.pnlPctTotal == null || Number(summary?.costTotal || 0) <= 0
                                ? "—"
                                : `${summary.pnlPctTotal > 0 ? "+" : ""}${summary.pnlPctTotal.toFixed(2)}%`}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-[color:var(--ink-900)]">
                          {summaryLoading ? "..." : t("accounts.assetsCount", lang).replace("{n}", String(Number(summary?.holdingsCount || 0)))}
                        </div>
                        {!summaryLoading && topHoldings.length > 0 ? (
                          <div className="text-xs text-[color:var(--muted)]">{topHoldings.map((item) => item.symbol).join(", ")}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <label className="inline-flex items-center gap-2 text-sm text-[color:var(--ink-900)]">
                          <input
                            type="radio"
                            name="default-account"
                            checked={account.is_default}
                            disabled={defaultLoading}
                            onChange={() => void onSetDefault(account)}
                            aria-label={`Set ${account.name} as default`}
                          />
                          {account.is_default ? (
                            <span className="inline-flex rounded-full bg-[color:rgba(79,85,241,0.12)] px-2 py-0.5 text-xs font-semibold text-[color:var(--brand-500)]">
                              Default
                            </span>
                          ) : null}
                        </label>
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenMenuId((prev) => (prev === account.id ? null : account.id))}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--muted)] hover:border hover:border-[color:var(--border)] hover:bg-white"
                            aria-label={`Open actions for ${account.name}`}
                          >
                            ⋯
                          </button>
                          {openMenuId === account.id ? (
                            <div className="absolute right-0 z-20 mt-1 w-32 rounded-xl border border-[color:var(--border)] bg-white p-1 shadow-lg">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setEditing(account);
                                  setSaveError("");
                                  setModalOpen(true);
                                }}
                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-[color:var(--ink-900)] hover:bg-[color:var(--bg-50)]"
                              >
                                {t("accounts.editAction", lang)}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setDeleteError("");
                                  setDeleteTarget(account);
                                }}
                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-[color:var(--danger)] hover:bg-[color:rgba(239,68,68,0.08)]"
                              >
                                {t("accounts.deleteAction", lang)}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggleExpand(account.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--muted)] hover:border hover:border-[color:var(--border)] hover:bg-white"
                          aria-label={`${expanded ? "Collapse" : "Expand"} holdings for ${account.name}`}
                        >
                          {expanded ? "⌃" : "⌄"}
                        </button>
                      </td>
                    </tr>

                    {expanded ? (
                      <tr className="border-b border-[color:var(--border)] bg-[color:var(--bg-50)]/60">
                        <td colSpan={10} className="px-6 py-4">
                          {summaryLoading ? (
                            <div className="space-y-2">
                              <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
                              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-200" />
                              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-200" />
                            </div>
                          ) : holdings.length === 0 ? (
                            <p className="text-sm text-[color:var(--muted)]">{t("accounts.noHoldings", lang)}</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="min-w-full border-collapse">
                                <thead>
                                  <tr className="text-left text-xs uppercase tracking-wider text-[color:var(--muted)]">
                                    <th className="px-3 py-2">{t("accounts.symbol", lang)}</th>
                                    <th className="px-3 py-2">{t("accounts.qty", lang)}</th>
                                    <th className="px-3 py-2">Avg Cost</th>
                                    <th className="px-3 py-2">Cost</th>
                                    <th className="px-3 py-2">{t("accounts.lastPrice", lang)}</th>
                                    <th className="px-3 py-2">Worth (Live)</th>
                                    <th className="px-3 py-2">PnL</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {holdings.map((holding) => (
                                    <tr key={`${account.id}-${holding.symbol}`} className="border-t border-[color:var(--border)]">
                                      <td className="px-3 py-2 text-sm font-semibold text-[color:var(--ink-900)]">
                                        <span className="inline-flex items-center gap-2">
                                          <AssetIcon symbol={holding.symbol} size={24} />
                                          {holding.symbol}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-sm text-[color:var(--ink-900)]">{formatNumber(Number(holding.qty || 0), 6)}</td>
                                      <td className="px-3 py-2 text-sm text-[color:var(--ink-900)]">{formatMoney(Number(holding.avgCost || 0))}</td>
                                      <td className="px-3 py-2 text-sm text-[color:var(--ink-900)]">{formatMoney(Number(holding.cost || 0))}</td>
                                      <td className="px-3 py-2 text-sm text-[color:var(--ink-900)]">
                                        {holding.lastPriceUsd == null ? "—" : formatMoney(Number(holding.lastPriceUsd || 0))}
                                      </td>
                                      <td className="px-3 py-2 text-sm font-semibold text-[color:var(--ink-900)]">
                                        {holding.worthLive == null ? (
                                          <span className="text-[color:var(--muted)]">—</span>
                                        ) : (
                                          formatMoney(Number(holding.worthLive || 0))
                                        )}
                                      </td>
                                      <td className={`px-3 py-2 text-sm font-semibold ${pnlTextClass(holding.pnl)}`}>
                                        {holding.pnl == null ? "—" : formatMoney(Number(holding.pnl || 0))}
                                        <span className="ml-1 text-xs">
                                          {holding.pnlPct == null || Number(holding.cost || 0) <= 0
                                            ? "(—)"
                                            : `(${holding.pnlPct > 0 ? "+" : ""}${holding.pnlPct.toFixed(2)}%)`}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
        </div>

        <div className="space-y-3 md:hidden">
          {accounts.map((account) => (
            <article
              key={`mobile-${account.id}`}
              className={`rounded-2xl border border-[color:var(--border)] bg-white p-4 ${
                account.is_default ? "bg-[color:rgba(79,85,241,0.06)]" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--ink-900)]">{account.name}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${kindChipClass(account.kind)}`}>
                      {kindShort(account.kind)}
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">{t("accounts.baseCurrency", lang)}: {account.base_currency}</span>
                  </div>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenMenuId((prev) => (prev === account.id ? null : account.id))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--muted)] hover:border hover:border-[color:var(--border)] hover:bg-white"
                    aria-label={`Open actions for ${account.name}`}
                  >
                    ⋯
                  </button>
                  {openMenuId === account.id ? (
                    <div className="absolute right-0 z-20 mt-1 w-32 rounded-xl border border-[color:var(--border)] bg-white p-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          setEditing(account);
                          setSaveError("");
                          setModalOpen(true);
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-[color:var(--ink-900)] hover:bg-[color:var(--bg-50)]"
                      >
                        {t("accounts.editAction", lang)}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          setDeleteError("");
                          setDeleteTarget(account);
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-[color:var(--danger)] hover:bg-[color:rgba(239,68,68,0.08)]"
                      >
                        {t("accounts.deleteAction", lang)}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-sm text-[color:var(--ink-900)]">
                  <input
                    type="radio"
                    name="default-account-mobile"
                    checked={account.is_default}
                    disabled={defaultLoading}
                    onChange={() => void onSetDefault(account)}
                    aria-label={`Set ${account.name} as default`}
                  />
                  {account.is_default ? (
                    <span className="inline-flex rounded-full bg-[color:rgba(79,85,241,0.12)] px-2 py-0.5 text-xs font-semibold text-[color:var(--brand-500)]">
                      Default
                    </span>
                  ) : (
                    <span className="text-xs text-[color:var(--muted)]">{t("accounts.setDefault", lang)}</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => toggleExpand(account.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--muted)] hover:border hover:border-[color:var(--border)] hover:bg-white"
                  aria-label={`${expandedAccountIds.includes(account.id) ? "Collapse" : "Expand"} holdings for ${account.name}`}
                >
                  {expandedAccountIds.includes(account.id) ? "⌃" : "⌄"}
                </button>
              </div>
              <div className="mt-2 text-sm text-[color:var(--ink-900)]">
                Cost (Avg): <span className="font-semibold">{summaryLoading ? "..." : formatMoney(Number(computedSummaryByAccountId[account.id]?.costTotal || 0))}</span>
              </div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                Worth (Live):{" "}
                <span className="font-semibold text-[color:var(--ink-900)]">
                  {summaryLoading
                    ? "..."
                    : computedSummaryByAccountId[account.id]?.worthTotal == null
                      ? "—"
                      : formatMoney(Number(computedSummaryByAccountId[account.id]?.worthTotal || 0))}
                </span>
              </div>
              <div className={`mt-1 text-xs ${pnlTextClass(computedSummaryByAccountId[account.id]?.pnlTotal)}`}>
                PnL:{" "}
                {summaryLoading
                  ? "..."
                  : computedSummaryByAccountId[account.id]?.pnlTotal == null
                    ? "—"
                    : `${formatMoney(Number(computedSummaryByAccountId[account.id]?.pnlTotal || 0))} ${
                        computedSummaryByAccountId[account.id]?.pnlPctTotal == null
                          ? "(—)"
                          : `(${computedSummaryByAccountId[account.id]!.pnlPctTotal! > 0 ? "+" : ""}${computedSummaryByAccountId[account.id]!.pnlPctTotal!.toFixed(2)}%)`
                      }`}
              </div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                {t("accounts.holdings", lang)}: {summaryLoading ? "..." : t("accounts.assetsCount", lang).replace("{n}", String(Number(computedSummaryByAccountId[account.id]?.holdingsCount || 0)))}
              </div>
              {!summaryLoading && (computedSummaryByAccountId[account.id]?.topHoldings || []).length > 0 ? (
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  {(computedSummaryByAccountId[account.id]?.topHoldings || [])
                    .slice(0, 3)
                    .map((holding) => `${holding.symbol} ${holding.worthLive == null ? "—" : formatMoney(Number(holding.worthLive || 0))}`)
                    .join(" • ")}
                </div>
              ) : null}

              {expandedAccountIds.includes(account.id) ? (
                <div className="mt-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-50)] p-3">
                  {summaryLoading ? (
                    <div className="space-y-2">
                      <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                      <div className="h-8 w-full animate-pulse rounded bg-slate-200" />
                    </div>
                  ) : (computedSummaryByAccountId[account.id]?.holdings || []).length === 0 ? (
                    <p className="text-xs text-[color:var(--muted)]">{t("accounts.noHoldings", lang)}</p>
                  ) : (
                    <div className="space-y-1">
                      {(computedSummaryByAccountId[account.id]?.holdings || []).map((holding) => (
                        <div key={`${account.id}-mobile-${holding.symbol}`} className="grid grid-cols-2 gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 font-semibold text-[color:var(--ink-900)]">
                            <AssetIcon symbol={holding.symbol} size={18} />
                            {holding.symbol}
                          </span>
                          <span className="text-[color:var(--ink-900)]">{formatNumber(Number(holding.qty || 0), 4)}</span>
                          <span className="text-[color:var(--ink-900)]">Avg: {formatMoney(Number(holding.avgCost || 0))}</span>
                          <span className="text-[color:var(--ink-900)]">Cost: {formatMoney(Number(holding.cost || 0))}</span>
                          <span className="text-[color:var(--ink-900)]">
                            Worth: {holding.worthLive == null ? "—" : formatMoney(Number(holding.worthLive || 0))}
                          </span>
                          <span className={pnlTextClass(holding.pnl)}>
                            PnL: {holding.pnl == null ? "—" : formatMoney(Number(holding.pnl || 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>

        {loading ? <p className="px-2 py-4 text-sm text-[color:var(--muted)]">{t("accounts.loadingAccounts", lang)}</p> : null}
        {!loading && hasAccounts && !accounts.some((account) => account.is_default) ? (
          <p className="px-2 py-2 text-sm text-[color:var(--muted)]">{t("accounts.noDefault", lang)}</p>
        ) : null}
        {!loading && !hasAccounts ? (
          <p className="px-2 py-4 text-sm text-[color:var(--muted)]">{t("accounts.noAccounts", lang)}</p>
        ) : null}
      </div>

      <AccountModal
        open={modalOpen}
        loading={saving}
        initialAccount={editing}
        onClose={() => {
          if (!saving) {
            setModalOpen(false);
          }
        }}
        onSubmit={onSaveAccount}
      />

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="card w-full max-w-sm">
            <h3 className="text-base font-semibold text-[color:var(--ink-900)]">{t("accounts.deleteTitle", lang)}</h3>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              {t("accounts.deleteConfirm", lang).replace("{name}", deleteTarget.name)}
            </p>
            {deleteError ? <p className="mt-3 text-sm text-[color:var(--danger)]">{deleteError}</p> : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="btn-secondary disabled:opacity-60">
                {t("accounts.cancel", lang)}
              </button>
              <button
                type="button"
                onClick={() => void onDeleteAccount()}
                disabled={deleting}
                className="rounded-full bg-[color:var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleting ? t("accounts.deleting", lang) : t("accounts.deleteAction", lang)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

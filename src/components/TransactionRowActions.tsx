"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NewTransactionModal, type EditableTransaction } from "@/components/NewTransactionModal";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";

interface Option {
  id?: number;
  symbol?: string;
  name: string;
}

interface TransactionRowActionsProps {
  transaction: EditableTransaction;
  accounts: Option[];
  assets: Option[];
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function TransactionRowActions({ transaction, accounts, assets }: TransactionRowActionsProps) {
  const router = useRouter();
  const { lang } = useLanguage();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function onDelete() {
    setLoadingDelete(true);
    setDeleteError("");

    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setDeleteError(body?.error || t("transactions.deleteTitle", lang));
        return;
      }

      setConfirmOpen(false);
      router.refresh();
    } catch {
      setDeleteError(t("transactions.deleteTitle", lang));
    } finally {
      setLoadingDelete(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <NewTransactionModal
          accounts={accounts}
          assets={assets}
          initialTransaction={transaction}
          triggerDisabled={loadingDelete}
          triggerClassName="inline-flex items-center justify-center rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          triggerContent={<EditIcon />}
        />

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={loadingDelete}
          className="inline-flex items-center justify-center rounded-md border border-rose-200 p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          aria-label={t("transactions.deleteTitle", lang)}
        >
          <TrashIcon />
        </button>
      </div>

      {deleteError ? <p className="text-xs text-rose-600">{deleteError}</p> : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">{t("transactions.deleteTitle", lang)}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {t("transactions.deleteConfirm", lang)}
            </p>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={loadingDelete}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
              >
                {t("transactions.cancel", lang)}
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={loadingDelete}
                className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loadingDelete ? t("transactions.deleting", lang) : t("transactions.delete", lang)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

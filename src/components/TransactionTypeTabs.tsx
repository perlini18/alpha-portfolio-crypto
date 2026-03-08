"use client";

import { useLanguage } from "@/components/LanguageProvider";

export type TradeTab = "BUY" | "SELL" | "TRANSFER";

interface TransactionTypeTabsProps {
  value: TradeTab;
  onChange: (tab: TradeTab) => void;
}

const tabs: { key: TradeTab; label: string; disabled?: boolean; helper?: string }[] = [
  { key: "BUY", label: "BUY" },
  { key: "SELL", label: "SELL" },
  { key: "TRANSFER", label: "TRANSFER", disabled: true, helper: "Coming soon" }
];

export function TransactionTypeTabs({ value, onChange }: TransactionTypeTabsProps) {
  const { lang } = useLanguage();

  return (
    <div className="grid grid-cols-3 gap-2 rounded-full bg-transparent">
      {tabs.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            disabled={tab.disabled}
            onClick={() => onChange(tab.key)}
            className={`rounded-full px-3 py-3 text-sm font-semibold transition-all duration-200 ${
              tab.disabled
                ? "cursor-not-allowed border border-slate-200 bg-white text-slate-400"
                : active
                  ? tab.key === "SELL"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "bg-slate-900 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <div>{tab.label}</div>
            {tab.helper ? <div className="mt-0.5 text-[11px] font-medium">{lang === "es" ? "Próximamente" : tab.helper}</div> : null}
          </button>
        );
      })}
    </div>
  );
}

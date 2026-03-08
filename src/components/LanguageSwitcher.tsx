"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { t, type LangMode } from "@/lib/i18n";

const options: Array<{ mode: LangMode; labelKey: "lang.es" | "lang.en" }> = [
  { mode: "es", labelKey: "lang.es" },
  { mode: "en", labelKey: "lang.en" }
];

export function LanguageSwitcher() {
  const { mode, setMode, lang } = useLanguage();

  return (
    <div className="inline-flex items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-1 shadow-sm">
      {options.map((option) => {
        const active = mode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            onClick={() => setMode(option.mode)}
            aria-pressed={active}
            aria-label={t(option.labelKey, lang)}
            className={`inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-400)] ${
              active
                ? "bg-[color:var(--brand-500)] text-[color:var(--ink-inverse)]"
                : "text-[color:var(--muted)] hover:bg-[color:var(--bg-50)]"
            }`}
          >
            {t(option.labelKey, lang)}
          </button>
        );
      })}
    </div>
  );
}

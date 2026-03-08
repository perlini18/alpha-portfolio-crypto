"use client";

import { useThemeMode } from "@/hooks/useThemeMode";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import type { ThemeMode } from "@/lib/theme";

const options: Array<{ mode: ThemeMode; icon: string; labelKey: "theme.light" | "theme.dark" | "theme.system" }> = [
  { mode: "light", icon: "☀️", labelKey: "theme.light" },
  { mode: "dark", icon: "🌙", labelKey: "theme.dark" },
  { mode: "system", icon: "🖥", labelKey: "theme.system" }
];

export function ThemeToggle() {
  const { mode, setMode } = useThemeMode();
  const { lang } = useLanguage();

  return (
    <div className="inline-flex items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-1 shadow-sm">
      {options.map((option) => {
        const active = mode === option.mode;
        const label = t(option.labelKey, lang);
        return (
          <button
            key={option.mode}
            type="button"
            onClick={() => setMode(option.mode)}
            aria-pressed={active}
            aria-label={label}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-400)] ${active
                ? "bg-[color:var(--brand-500)] text-[color:var(--ink-inverse)]"
                : "text-[color:var(--muted)] hover:bg-[color:var(--bg-50)]"
              }`}
          >
            <span aria-hidden>{option.icon}</span>
            {option.mode !== "system" ? <span className="hidden sm:inline">{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

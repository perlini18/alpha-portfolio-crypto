"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LANG_STORAGE_KEY, resolveSystemLang, type Lang, type LangMode } from "@/lib/i18n";

interface LanguageContextValue {
  lang: Lang;
  mode: LangMode;
  setMode: (mode: LangMode) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLangMode(): LangMode {
  if (typeof window === "undefined") {
    return "system";
  }
  const raw = window.localStorage.getItem(LANG_STORAGE_KEY);
  if (raw === "es" || raw === "en" || raw === "system") {
    return raw;
  }
  return "system";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<LangMode>("system");
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const stored = readStoredLangMode();
    const resolved = stored === "system" ? resolveSystemLang() : stored;
    setModeState(stored);
    setLang(resolved);
    document.documentElement.lang = resolved;
  }, []);

  useEffect(() => {
    function onLanguageChange() {
      if (mode !== "system") {
        return;
      }
      const resolved = resolveSystemLang();
      setLang(resolved);
      document.documentElement.lang = resolved;
    }

    window.addEventListener("languagechange", onLanguageChange);
    return () => window.removeEventListener("languagechange", onLanguageChange);
  }, [mode]);

  function setMode(modeValue: LangMode) {
    setModeState(modeValue);
    window.localStorage.setItem(LANG_STORAGE_KEY, modeValue);
    const resolved = modeValue === "system" ? resolveSystemLang() : modeValue;
    setLang(resolved);
    document.documentElement.lang = resolved;
  }

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      mode,
      setMode
    }),
    [lang, mode]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return ctx;
}

"use client";

import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, type ResolvedTheme, type ThemeMode } from "@/lib/theme";

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const stored = getStoredTheme();
    setMode(stored);
    setResolvedTheme(applyTheme(stored));
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function onChange() {
      if (mode !== "system") {
        return;
      }
      setResolvedTheme(applyTheme("system"));
    }

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  function updateMode(nextMode: ThemeMode) {
    setMode(nextMode);
    setResolvedTheme(applyTheme(nextMode));
  }

  return {
    mode,
    setMode: updateMode,
    resolvedTheme
  };
}

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme_mode";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(raw) ? raw : "system";
}

export function setStoredTheme(mode: ThemeMode) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "dark") {
    return "dark";
  }
  if (mode === "light") {
    return "light";
  }
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof window === "undefined") {
    return "light" as ResolvedTheme;
  }
  const resolved = resolveTheme(mode);
  const root = window.document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  root.style.colorScheme = resolved;
  setStoredTheme(mode);
  return resolved;
}

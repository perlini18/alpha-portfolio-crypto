"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type PricesStatus = "idle" | "loading" | "ready" | "error";

interface PricesContextValue {
  pricesMap: Record<string, number>;
  status: PricesStatus;
  lastUpdated: Date | null;
  loadOnce: () => Promise<void>;
  refresh: (force?: boolean) => Promise<void>;
}

interface PricesMapResponse {
  prices?: Record<string, number>;
  updatedAt?: string;
}

const COOLDOWN_MS = 30_000;

const PricesContext = createContext<PricesContextValue | null>(null);

export function PricesProvider({ children }: { children: React.ReactNode }) {
  const [pricesMap, setPricesMap] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<PricesStatus>("idle");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const fetchPrices = useCallback(async (force = false) => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const run = (async () => {
      setStatus((current) => (current === "ready" ? "ready" : "loading"));
      try {
        const suffix = force ? "?force=1" : "";
        const res = await fetch(`/api/prices/map${suffix}`, { cache: "no-store", credentials: "include" });
        if (!res.ok) {
          throw new Error("prices_map_failed");
        }
        const body = (await res.json()) as PricesMapResponse;
        const normalized: Record<string, number> = {};
        for (const [symbol, value] of Object.entries(body.prices || {})) {
          const key = symbol.toUpperCase();
          if (typeof value === "number" && value > 0) {
            normalized[key] = value;
          }
        }
        setPricesMap(normalized);
        setStatus("ready");
        setLastUpdated(body.updatedAt ? new Date(body.updatedAt) : new Date());
      } catch {
        setStatus("error");
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = run;
    return run;
  }, []);

  const loadOnce = useCallback(async () => {
    if (status === "ready") {
      return;
    }
    await fetchPrices(false);
  }, [fetchPrices, status]);

  const refresh = useCallback(
    async (force = false) => {
      const now = Date.now();
      const lastTs = lastUpdated?.getTime() ?? 0;
      if (!force && lastTs && now - lastTs < COOLDOWN_MS) {
        return;
      }
      await fetchPrices(force);
    },
    [fetchPrices, lastUpdated]
  );

  const value = useMemo<PricesContextValue>(
    () => ({
      pricesMap,
      status,
      lastUpdated,
      loadOnce,
      refresh
    }),
    [lastUpdated, loadOnce, pricesMap, refresh, status]
  );

  return <PricesContext.Provider value={value}>{children}</PricesContext.Provider>;
}

export function usePrices() {
  const ctx = useContext(PricesContext);
  if (!ctx) {
    throw new Error("usePrices must be used inside PricesProvider");
  }
  return ctx;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AdsFreeState {
  adsFree: boolean;
  currentPeriodEnd: string | null;
}

export function useAdsFree() {
  const [state, setState] = useState<AdsFreeState>({ adsFree: false, currentPeriodEnd: null });
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const didLoadOnceRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const run = (async () => {
      if (!didLoadOnceRef.current && mountedRef.current) {
        setLoading(true);
      }
      try {
        const res = await fetch("/api/entitlements/ads-free", {
          cache: "no-store",
          credentials: "include"
        });

        if (!res.ok) {
          if (mountedRef.current) {
            setState({ adsFree: false, currentPeriodEnd: null });
          }
          return;
        }

        const data = (await res.json()) as { adsFree?: boolean; currentPeriodEnd?: string };
        if (mountedRef.current) {
          setState({
            adsFree: Boolean(data?.adsFree),
            currentPeriodEnd: data?.currentPeriodEnd || null
          });
        }
      } catch {
        if (mountedRef.current) {
          setState({ adsFree: false, currentPeriodEnd: null });
        }
      } finally {
        didLoadOnceRef.current = true;
        if (mountedRef.current) {
          setLoading(false);
        }
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return {
    adsFree: state.adsFree,
    currentPeriodEnd: state.currentPeriodEnd,
    loading,
    refresh
  };
}

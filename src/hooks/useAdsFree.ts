"use client";

import { useCallback, useEffect, useState } from "react";

interface AdsFreeState {
  adsFree: boolean;
  currentPeriodEnd: string | null;
}

export function useAdsFree() {
  const [state, setState] = useState<AdsFreeState>({ adsFree: false, currentPeriodEnd: null });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/entitlements/ads-free", {
        cache: "no-store",
        credentials: "include"
      });

      if (!res.ok) {
        setState({ adsFree: false, currentPeriodEnd: null });
        return;
      }

      const data = (await res.json()) as { adsFree?: boolean; currentPeriodEnd?: string };
      setState({
        adsFree: Boolean(data?.adsFree),
        currentPeriodEnd: data?.currentPeriodEnd || null
      });
    } catch {
      setState({ adsFree: false, currentPeriodEnd: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    adsFree: state.adsFree,
    currentPeriodEnd: state.currentPeriodEnd,
    loading,
    refresh
  };
}

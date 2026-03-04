"use client";

import { useEffect, useState } from "react";

interface AssetPriceEditorProps {
  symbol: string;
  lastPrice: number;
  onSaved?: () => void;
}

export function AssetPriceEditor({ symbol, lastPrice, onSaved }: AssetPriceEditorProps) {
  const [value, setValue] = useState(String(lastPrice));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(String(lastPrice));
  }, [lastPrice]);

  async function onSave() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, last_price: Number(value) })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || "Failed to update price");
        return;
      }

      if (onSaved) {
        onSaved();
      } else {
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="number"
          step="any"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={loading}
          className="rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "..." : "Save"}
        </button>
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

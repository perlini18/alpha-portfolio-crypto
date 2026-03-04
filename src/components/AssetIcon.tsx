"use client";

import { useMemo, useState } from "react";

interface AssetIconProps {
  symbol: string;
  size?: number;
  className?: string;
}

export function AssetIcon({ symbol, size = 24, className = "" }: AssetIconProps) {
  const [failed, setFailed] = useState(false);
  const normalized = symbol.trim().toLowerCase();
  const safeSymbol = symbol.trim().toUpperCase();

  const url = useMemo(() => {
    if (!normalized) {
      return "";
    }
    return `/api/icons/${normalized}`;
  }, [normalized]);

  const wrapperSize = Math.max(28, size + 8);
  const imageSize = Math.max(16, size);
  const fallbackLetter = safeSymbol.charAt(0) || "?";

  return (
    <span
      className={`inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-100 ${className}`}
      style={{ width: wrapperSize, height: wrapperSize }}
      aria-hidden="true"
    >
      {!failed && url ? (
        <img
          src={url}
          alt={`${safeSymbol} logo`}
          loading="lazy"
          className="h-6 w-6 object-contain"
          style={{ width: imageSize, height: imageSize }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-xs font-bold uppercase text-slate-600">{fallbackLetter}</span>
      )}
    </span>
  );
}

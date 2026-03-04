import { formatMoney } from "@/lib/format";

interface PnlPillProps {
  value: number;
  percent?: number | null;
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function PnlPill({ value, percent }: PnlPillProps) {
  const toneClass = value > 0 ? "pill-success" : value < 0 ? "pill-danger" : "pill-neutral";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      {formatMoney(value)}
      {typeof percent === "number" && Number.isFinite(percent) ? ` (${formatPercent(percent)})` : ""}
    </span>
  );
}

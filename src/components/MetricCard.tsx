import { formatMoney } from "@/lib/format";

interface MetricCardProps {
  label: string;
  value: number;
}

export function MetricCard({ label, value }: MetricCardProps) {
  const tone = value >= 0 ? "text-emerald-600" : "text-rose-600";

  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${tone}`}>{formatMoney(value)}</div>
    </div>
  );
}

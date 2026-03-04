interface StatCardProps {
  label: string;
  value: string;
  subvalue?: string;
  tone?: "neutral" | "success" | "danger";
  large?: boolean;
}

export function StatCard({ label, value, subvalue, tone = "neutral", large = false }: StatCardProps) {
  const toneClass =
    tone === "success" ? "text-[color:var(--success)]" : tone === "danger" ? "text-[color:var(--danger)]" : "text-[color:var(--ink-900)]";

  return (
    <article className="card">
      <p className="label-xs">{label}</p>
      <p className={`mt-3 font-extrabold leading-none ${large ? "text-5xl" : "text-3xl"} ${toneClass}`}>{value}</p>
      {subvalue ? <p className="mt-3 text-sm text-[color:var(--muted)]">{subvalue}</p> : null}
    </article>
  );
}

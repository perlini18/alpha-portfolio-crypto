"use client";

import type { ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function CollapsibleSection({ title, open, onToggle, children }: CollapsibleSectionProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="border-t border-slate-200 p-4">{children}</div> : null}
    </section>
  );
}

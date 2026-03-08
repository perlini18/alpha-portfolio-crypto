"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname.startsWith(href);
}

function NavIcon({ path, active }: { path: string; active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? "text-[color:var(--brand-500)]" : "text-[color:var(--muted)]"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { lang } = useLanguage();

  const tabs = [
    { href: "/dashboard", label: t("nav.dashboard", lang), icon: "M3 10.5 12 3l9 7.5V21H3z" },
    { href: "/portfolio", label: t("nav.portfolio", lang), icon: "M4 6h16M4 12h16M4 18h10" },
    { href: "/accounts", label: t("nav.accounts", lang), icon: "M4 20h16M7 20V8h10v12M9 8V4h6v4" },
    { href: "/transactions", label: t("nav.transactions", lang), icon: "M5 5h14v14H5zM9 9h6M9 13h6" }
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--border)] bg-[color:var(--card)]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-6xl grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold ${
                  active
                    ? "bg-[color:rgba(79,85,241,0.1)] text-[color:var(--brand-500)]"
                    : "text-[color:var(--muted)]"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <NavIcon path={tab.icon} active={active} />
                <span className="truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";

export function Nav() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const links = [
    { href: "/", label: t("nav.dashboard", lang) },
    { href: "/portfolio", label: t("nav.portfolio", lang) },
    { href: "/accounts", label: t("nav.accounts", lang) },
    { href: "/transactions", label: t("nav.transactions", lang) }
  ];

  return (
    <header className="border-b border-[color:var(--border)] bg-[color:var(--card)]/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6 md:py-4">
        <div className="text-base font-bold tracking-tight text-[color:var(--ink-900)] md:text-lg">crypto-tracker</div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden gap-2 text-sm font-medium text-[color:var(--muted)] md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1 hover:bg-[color:var(--bg-50)] hover:text-[color:var(--ink-900)] ${
                  pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))
                    ? "bg-[color:var(--bg-50)] text-[color:var(--ink-900)]"
                    : ""
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import alphaLogo from "@/app/alpha-logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";
import { maskEmail } from "@/lib/security";

export function Nav() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const { data: session, status } = useSession();
  const links = [
    { href: "/dashboard", label: t("nav.dashboard", lang) },
    { href: "/portfolio", label: t("nav.portfolio", lang) },
    { href: "/accounts", label: t("nav.accounts", lang) },
    { href: "/transactions", label: t("nav.transactions", lang) }
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--border)]/80 bg-[color:var(--card)]/72 backdrop-blur-2xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 md:gap-8 md:px-6 md:py-5">
        <div className="flex min-w-[220px] shrink-0 items-center gap-3.5">
          <Image
            src={alphaLogo}
            alt="Alpha logo"
            width={42}
            height={42}
            className="h-10 w-10 shrink-0 rounded-xl object-contain"
            priority
          />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-semibold tracking-tight text-[color:var(--ink-900)] md:text-[17px]">
              Alpha Portfolio
            </p>
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--muted)]">
              tracker
            </p>
          </div>
        </div>

        <div className="hidden flex-1 items-center justify-center md:flex">
          <div className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--muted)]">
            {links.map((link) => {
              const isActive =
                pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative rounded-lg px-3.5 py-2 transition-colors hover:text-[color:var(--ink-900)] ${isActive ? "text-[color:var(--ink-900)]" : "text-[color:var(--muted)]"
                    }`}
                >
                  {link.label}
                  <span
                    className={`absolute inset-x-2 -bottom-[12px] h-0.5 rounded-full bg-[color:var(--brand-500)] transition-opacity ${isActive ? "opacity-100" : "opacity-0"
                      }`}
                  />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
          {status !== "loading" ? (
            session?.user ? (
              <div className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-2 py-1">
                {session.user.image ? (
                  <img src={session.user.image} alt={session.user.name || "User avatar"} className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--bg-50)] text-xs font-bold">
                    {(session.user.name || session.user.email || "U").charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-[140px] truncate text-sm text-[color:var(--ink-900)] md:inline">
                  {session.user.name || maskEmail(session.user.email)}
                </span>
                <button
                  type="button"
                  onClick={() => void signOut({ callbackUrl: "/login" })}
                  className="rounded-full px-2 py-1 text-xs font-semibold text-[color:var(--muted)] hover:bg-[color:var(--bg-50)]"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link href="/login" className="btn-secondary">
                Sign in
              </Link>
            )
          ) : null}
        </div>
      </nav>
    </header>
  );
}

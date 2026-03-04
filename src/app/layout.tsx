import type { Metadata } from "next";
import "./globals.css";
import "@/styles/theme.css";
import { Nav } from "@/components/Nav";
import { LanguageProvider } from "@/components/LanguageProvider";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PricesProvider } from "@/lib/prices-store";

export const metadata: Metadata = {
  title: "crypto-tracker",
  description: "Personal portfolio tracker"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeScript = `
    (function () {
      try {
        var mode = localStorage.getItem('theme_mode');
        var isDark = false;
        if (mode === 'dark') {
          isDark = true;
        } else if (mode === 'light') {
          isDark = false;
        } else {
          isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        var root = document.documentElement;
        if (isDark) root.classList.add('dark');
        else root.classList.remove('dark');
        root.style.colorScheme = isDark ? 'dark' : 'light';
      } catch (e) {}
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-app text-[color:var(--ink-900)]">
        <LanguageProvider>
          <PricesProvider>
            <Nav />
            <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:px-6 md:py-8 md:pb-8">{children}</main>
            <MobileBottomNav />
          </PricesProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}

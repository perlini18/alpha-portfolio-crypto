import { NextResponse } from "next/server";
import { z } from "zod";
import type { Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const pageSchema = z.enum(["dashboard", "portfolio", "accounts", "transactions"]);

interface EnvAd {
  id: number;
  title: string;
  url: string;
  brand: string | null;
  subtitle: string | null;
  cta: string | null;
  accent: string | null;
  tags: string[];
}

function isDisabledByEnv() {
  const raw = process.env.NEXT_PUBLIC_DISABLE_ADS;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}

function isSafeHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function shuffle<T>(items: T[]) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickLangValue(i: number, field: "TITLE" | "SUBTITLE" | "CTA", lang: Lang) {
  const primary = process.env[`NEXT_PUBLIC_AD_${i}_${field}_${lang.toUpperCase()}`]?.trim();
  const alternateLang = lang === "en" ? "ES" : "EN";
  const fallbackOtherLang = process.env[`NEXT_PUBLIC_AD_${i}_${field}_${alternateLang}`]?.trim();
  const legacy = process.env[`NEXT_PUBLIC_AD_${i}_${field}`]?.trim();
  return primary || fallbackOtherLang || legacy || "";
}

function parseAdsFromEnv(lang: Lang) {
  const ads: EnvAd[] = [];
  for (let i = 1; i <= 20; i += 1) {
    const title = pickLangValue(i, "TITLE", lang);
    const url = process.env[`NEXT_PUBLIC_AD_${i}_URL`]?.trim() || "";

    if (!title || !url || !isSafeHttpUrl(url)) {
      continue;
    }

    const tags = (process.env[`NEXT_PUBLIC_AD_${i}_TAGS`] || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    ads.push({
      id: -i,
      title,
      url,
      brand: process.env[`NEXT_PUBLIC_AD_${i}_BRAND`]?.trim() || null,
      subtitle: pickLangValue(i, "SUBTITLE", lang) || null,
      cta: pickLangValue(i, "CTA", lang) || null,
      accent: process.env[`NEXT_PUBLIC_AD_${i}_ACCENT`]?.trim() || null,
      tags
    });
  }

  if (ads.length === 0) {
    console.warn(
      "[api/ads] 0 ads loaded. Expected env keys like NEXT_PUBLIC_AD_1_TITLE and NEXT_PUBLIC_AD_1_URL"
    );
  }

  return ads;
}

export async function GET(request: Request) {
  const noStoreHeaders = { "Cache-Control": "no-store" };

  if (isDisabledByEnv()) {
    return NextResponse.json({ ads: [] }, { headers: noStoreHeaders });
  }

  const { searchParams } = new URL(request.url);
  const pageRaw = searchParams.get("page");
  const langRaw = searchParams.get("lang");
  const lang: Lang = langRaw === "es" ? "es" : "en";
  const limitRaw = Number(searchParams.get("limit") || 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, Math.floor(limitRaw))) : 10;

  const pageParsed = pageSchema.safeParse(pageRaw || "");
  if (!pageParsed.success) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400, headers: noStoreHeaders });
  }

  const ads = shuffle(parseAdsFromEnv(lang)).slice(0, limit);
  return NextResponse.json({ ads }, { headers: noStoreHeaders });
}

export interface EnvAd {
  id: number;
  brand: string;
  title: string;
  subtitle: string | null;
  url: string;
  cta: string;
  accent: string;
}

function isSafeHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getAdsFromEnv(env: Record<string, string | undefined> = process.env): EnvAd[] {
  const ads: EnvAd[] = [];

  for (let i = 1; i <= 20; i += 1) {
    const title = env[`NEXT_PUBLIC_AD_${i}_TITLE`]?.trim() || "";
    const url = env[`NEXT_PUBLIC_AD_${i}_URL`]?.trim() || "";

    if (!title || !url || !isSafeHttpUrl(url)) {
      continue;
    }

    ads.push({
      id: -i,
      brand: env[`NEXT_PUBLIC_AD_${i}_BRAND`]?.trim() || "",
      title,
      subtitle: env[`NEXT_PUBLIC_AD_${i}_SUBTITLE`]?.trim() || null,
      url,
      cta: env[`NEXT_PUBLIC_AD_${i}_CTA`]?.trim() || "",
      accent: env[`NEXT_PUBLIC_AD_${i}_ACCENT`]?.trim() || "brand"
    });
  }

  return ads;
}

export function shuffleAds<T>(items: T[]) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

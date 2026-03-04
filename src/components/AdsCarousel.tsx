"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Toast } from "@/components/Toast";
import { useLanguage } from "@/components/LanguageProvider";
import { useAdsFree } from "@/hooks/useAdsFree";
import { t } from "@/lib/i18n";

type AdsPage = "dashboard" | "portfolio" | "accounts" | "transactions";

interface AdItem {
  id: number;
  brand: string;
  title: string;
  subtitle: string | null;
  url: string;
  cta: string;
  accent: string;
  tags?: string[] | null;
  image_url?: string | null;
}

interface AdsCarouselProps {
  page: AdsPage;
  limit?: number;
}

function isSafeHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function RemoveAdsModal({
  open,
  onClose,
  loadingCheckout,
  onCheckoutUsd,
  lang
}: {
  open: boolean;
  onClose: () => void;
  loadingCheckout: boolean;
  onCheckoutUsd: () => void;
  lang: "es" | "en";
}) {
  const usdtEnabled = false;

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label={t("ads.removeTitle", lang)}>
      <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-label="Close subscription modal" />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-[color:var(--border)] bg-white p-6 shadow-xl">
        <h3 className="text-xl font-bold text-[color:var(--ink-900)]">{t("ads.removeTitle", lang)}</h3>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {t("ads.removeSubtitle", lang)}
        </p>

        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={onCheckoutUsd}
            disabled={loadingCheckout}
            className="btn-primary w-full disabled:opacity-60"
          >
            {loadingCheckout ? t("ads.redirecting", lang) : t("ads.payUsd", lang)}
          </button>
          <button
            type="button"
            disabled={!usdtEnabled}
            className="btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-60"
            title={usdtEnabled ? "USDT provider enabled" : "USDT provider not configured yet"}
          >
            {t("ads.payUsdtSoon", lang)}
          </button>
          <button type="button" onClick={onClose} className="w-full rounded-full px-4 py-2 text-sm font-medium text-[color:var(--muted)] hover:bg-[color:var(--bg-50)]">
            {t("ads.notNow", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdsCarousel({ page, limit = 10 }: AdsCarouselProps) {
  const { adsFree, loading: adsFreeLoading, refresh: refreshAdsFree } = useAdsFree();
  const { lang } = useLanguage();
  const pathname = usePathname();

  const [ads, setAds] = useState<AdItem[]>([]);
  const [loadingAds, setLoadingAds] = useState(true);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const impressedRef = useRef<Set<number>>(new Set());

  function showToast(message: string) {
    setToastMessage(message);
    setToastVisible(true);
    window.setTimeout(() => {
      setToastVisible(false);
    }, 2800);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (!billing) {
      return;
    }

    if (billing === "success") {
      showToast(t("ads.subscriptionActive", lang));
      void refreshAdsFree();
    } else if (billing === "cancel") {
      showToast(t("ads.checkoutCanceled", lang));
    }

    const nextUrl = `${pathname}`;
    window.history.replaceState({}, "", nextUrl);
  }, [lang, pathname, refreshAdsFree]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (adsFreeLoading || adsFree) {
      return;
    }

    let canceled = false;
    const controller = new AbortController();

    async function loadAds() {
      setLoadingAds(true);
      try {
        const res = await fetch(`/api/ads?page=${page}&limit=${limit}&lang=${lang}`, {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal
        });
        if (!res.ok) {
          return;
        }

        const body = (await res.json()) as { ads?: AdItem[] };
        if (!canceled && Array.isArray(body?.ads)) {
          setAds(Array.isArray(body?.ads) ? body.ads : []);
        }
      } catch {
        // keep previous ads
      } finally {
        if (!canceled) {
          setLoadingAds(false);
        }
      }
    }

    void loadAds();

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [adsFree, adsFreeLoading, limit, page, lang]);

  const visibleAds = ads.filter((ad) => isSafeHttpUrl(ad.url));

  useEffect(() => {
    setIndex(0);
    impressedRef.current = new Set();
  }, [visibleAds.length]);

  async function trackEvent(adId: number, eventType: "impression" | "click") {
    try {
      await fetch("/api/ads/event", {
        method: "POST",
        cache: "no-store",
        keepalive: true,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId,
          eventType,
          page
        })
      });
    } catch {
      // ignore tracking failures
    }
  }

  async function startCheckout() {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/ads-free/checkout", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnPath: pathname || "/"
        })
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        showToast(body?.error || "Unable to start checkout");
        return;
      }

      const data = (await res.json()) as { url?: string };
      if (!data?.url) {
        showToast("Checkout URL not available");
        return;
      }

      window.location.assign(data.url);
    } catch {
      showToast("Checkout failed");
    } finally {
      setCheckoutLoading(false);
    }
  }

  function scrollToIndex(nextIndex: number, smooth = true) {
    const total = visibleAds.length;
    if (!total) {
      return;
    }
    const normalized = (nextIndex + total) % total;
    setIndex(normalized);
    const node = cardRefs.current[normalized];
    if (node) {
      node.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        inline: "start",
        block: "nearest"
      });
    }
  }

  useEffect(() => {
    if (paused || reducedMotion || visibleAds.length <= 1) {
      return;
    }
    const intervalId = window.setInterval(() => {
      scrollToIndex(index + 1, true);
    }, 6000);
    return () => window.clearInterval(intervalId);
  }, [index, paused, reducedMotion, visibleAds.length]);

  useEffect(() => {
    const root = viewportRef.current;
    if (!root || visibleAds.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target as HTMLDivElement;
          const adId = Number(target.dataset.adId || 0);
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6 && adId > 0) {
            if (!impressedRef.current.has(adId)) {
              impressedRef.current.add(adId);
              void trackEvent(adId, "impression");
            }
          }
        });
      },
      { root, threshold: [0.6] }
    );

    cardRefs.current.forEach((node) => {
      if (node) {
        observer.observe(node);
      }
    });

    return () => observer.disconnect();
  }, [visibleAds]);

  function onViewportScroll() {
    const root = viewportRef.current;
    if (!root || visibleAds.length === 0) {
      return;
    }
    const left = root.scrollLeft;
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    cardRefs.current.forEach((node, idx) => {
      if (!node) {
        return;
      }
      const distance = Math.abs(node.offsetLeft - left);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = idx;
      }
    });
    if (nearest !== index) {
      setIndex(nearest);
    }
  }

  function onAdClick(ad: AdItem) {
    if (!isSafeHttpUrl(ad.url)) {
      return;
    }
    if (ad.id > 0) {
      void trackEvent(ad.id, "click");
    }
    window.open(ad.url, "_blank", "noopener,noreferrer");
  }

  function accentStyles(accent: string) {
    const normalized = accent.toLowerCase();
    if (normalized === "green" || normalized === "success") {
      return {
        badge: "bg-[color:rgba(22,163,74,0.14)] text-[color:var(--success)]",
        gradient: "from-[color:rgba(22,163,74,0.25)] to-[color:rgba(22,163,74,0.08)]",
        cta: "bg-[color:var(--success)] hover:bg-[color:#22c55e]"
      };
    }
    if (normalized === "red" || normalized === "danger") {
      return {
        badge: "bg-[color:rgba(239,68,68,0.14)] text-[color:var(--danger)]",
        gradient: "from-[color:rgba(239,68,68,0.22)] to-[color:rgba(239,68,68,0.08)]",
        cta: "bg-[color:var(--danger)] hover:bg-[color:#f87171]"
      };
    }
    if (normalized === "amber" || normalized === "yellow") {
      return {
        badge: "bg-[color:rgba(245,158,11,0.18)] text-[color:#b45309]",
        gradient: "from-[color:rgba(245,158,11,0.25)] to-[color:rgba(245,158,11,0.08)]",
        cta: "bg-[color:#d97706] hover:bg-[color:#f59e0b]"
      };
    }
    return {
      badge: "bg-[color:rgba(79,85,241,0.14)] text-[color:var(--brand-500)]",
      gradient: "from-[color:var(--brand-400)]/30 to-[color:var(--brand-500)]/10",
      cta: "bg-[color:var(--brand-500)] hover:bg-[color:var(--brand-400)]"
    };
  }

  if (adsFree) {
    return null;
  }

  if (adsFreeLoading || (loadingAds && ads.length === 0)) {
    return (
      <section className="min-h-[190px]">
        <div className="flex gap-3 overflow-hidden">
          <div className="h-40 w-[260px] animate-pulse rounded-3xl border border-[color:var(--border)] bg-slate-100 md:w-[320px]" />
          <div className="hidden h-40 w-[260px] animate-pulse rounded-3xl border border-[color:var(--border)] bg-slate-100 sm:block md:w-[320px]" />
        </div>
      </section>
    );
  }

  if (visibleAds.length === 0) {
    return null;
  }

  return (
    <section className="min-h-[190px]">
      <Toast message={toastMessage} visible={toastVisible} />
      <RemoveAdsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loadingCheckout={checkoutLoading}
        onCheckoutUsd={() => void startCheckout()}
        lang={lang}
      />

      <div
        className="relative"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <button
          type="button"
          className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--border)] bg-white/90 text-[color:var(--muted)] shadow-sm hover:bg-white hover:text-[color:var(--ink-900)]"
          aria-label="Remove ads subscription options"
          onClick={() => setModalOpen(true)}
        >
          ×
        </button>

        <>
            <div
              ref={viewportRef}
              onScroll={onViewportScroll}
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {visibleAds.map((ad, idx) => (
                <div
                  key={ad.id}
                  ref={(node) => {
                    cardRefs.current[idx] = node;
                  }}
                  data-ad-id={ad.id}
                  className="card relative h-40 w-[260px] shrink-0 snap-start overflow-hidden p-4 md:w-[320px]"
                >
                  <button type="button" onClick={() => onAdClick(ad)} className="absolute inset-0 z-0" aria-label={`Open ad ${ad.title}`} />
                  <div className="relative z-10 flex h-full items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accentStyles(ad.accent).badge}`}>
                        {ad.brand}
                      </span>
                      <p className="text-sm font-semibold text-[color:var(--ink-900)]">{ad.title}</p>
                      {ad.subtitle ? <p className="mt-1 text-xs text-[color:var(--muted)]">{ad.subtitle}</p> : null}
                      <button
                        type="button"
                        onClick={() => onAdClick(ad)}
                        className={`mt-3 rounded-full px-3 py-1.5 text-xs font-semibold text-white ${accentStyles(ad.accent).cta}`}
                      >
                        {ad.cta}
                      </button>
                    </div>
                    {ad.image_url ? (
                      <img src={ad.image_url} alt="" className="h-20 w-20 rounded-2xl object-cover" loading="lazy" />
                    ) : (
                      <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${accentStyles(ad.accent).gradient}`} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {visibleAds.length > 1 ? (
              <>
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  {visibleAds.map((ad, dotIdx) => (
                    <button
                      key={`dot-${ad.id}`}
                      type="button"
                      onClick={() => scrollToIndex(dotIdx, true)}
                      className={`h-2 rounded-full transition-all ${dotIdx === index ? "w-4 bg-[color:var(--brand-500)]" : "w-2 bg-[color:var(--border)]"}`}
                      aria-label={`Go to ad ${dotIdx + 1}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => scrollToIndex(index - 1, true)}
                  className="absolute left-0 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--border)] bg-white text-[color:var(--ink-900)] shadow-sm hover:bg-[color:var(--bg-50)] md:inline-flex"
                  aria-label="Previous ad"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => scrollToIndex(index + 1, true)}
                  className="absolute right-0 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--border)] bg-white text-[color:var(--ink-900)] shadow-sm hover:bg-[color:var(--bg-50)] md:inline-flex"
                  aria-label="Next ad"
                >
                  ›
                </button>
              </>
            ) : null}
          </>
      </div>
    </section>
  );
}

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function buildFallbackSvg(symbol: string) {
  const letter = (symbol[0] || "?").toUpperCase();
  const safe = symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${safe} icon fallback">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="32" fill="url(#g)"/>
  <text x="50%" y="54%" text-anchor="middle" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="24" font-weight="700" fill="#334155">${letter}</text>
</svg>`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await context.params;
  const normalized = String(symbol || "").trim().toLowerCase();

  if (!normalized) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  const upstreamUrls = [
    `https://cryptoicons.org/api/icon/${encodeURIComponent(normalized)}/64`,
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${encodeURIComponent(normalized)}.png`
  ];

  try {
    for (const upstreamUrl of upstreamUrls) {
      const upstream = await fetch(upstreamUrl, { cache: "no-store" });
      if (!upstream.ok) {
        continue;
      }

      const contentType = upstream.headers.get("content-type") || "image/png";
      const body = await upstream.arrayBuffer();

      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400"
        }
      });
    }
    return new NextResponse(buildFallbackSvg(normalized), {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch (error) {
    return new NextResponse(buildFallbackSvg(normalized), {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400"
      }
    });
  }
}

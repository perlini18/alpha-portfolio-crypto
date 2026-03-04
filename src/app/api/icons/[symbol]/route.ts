import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await context.params;
  const normalized = String(symbol || "").trim().toLowerCase();

  if (!normalized) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  const upstreamUrl = `https://cryptoicons.org/api/icon/${encodeURIComponent(normalized)}/64`;

  try {
    const upstream = await fetch(upstreamUrl, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Icon not found" }, { status: 404 });
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
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch icon", details: String(error) },
      { status: 502 }
    );
  }
}

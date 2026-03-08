import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  adId: z.number().int().positive(),
  eventType: z.enum(["impression", "click"]),
  page: z.enum(["dashboard", "portfolio", "accounts", "transactions"])
});

function getOrCreateAnonymousSessionId() {
  const cookieStore = cookies();
  const existing = cookieStore.get("anonymous_session_id")?.value;
  if (existing && existing.length >= 16) {
    return { id: existing, created: false };
  }
  return { id: crypto.randomUUID(), created: true };
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  try {
    const parsed = eventSchema.parse(await request.json());
    const rl = checkRateLimit({
      key: `ads:event:${ip}:${parsed.eventType}:${parsed.page}:${parsed.adId}`,
      limit: 30,
      windowMs: 60_000
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const session = getOrCreateAnonymousSessionId();

    let deduped = false;

    try {
      const adExists = await pool.query("SELECT id FROM ads WHERE id = $1 LIMIT 1", [parsed.adId]);
      if (!adExists.rows[0]) {
        return NextResponse.json({ error: "Ad not found" }, { status: 404 });
      }

      const recent = await pool.query(
        `SELECT id
         FROM ad_events
         WHERE ad_id = $1
           AND event_type = $2
           AND page = $3
           AND anonymous_session_id = $4
           AND created_at >= NOW() - INTERVAL '1 minute'
         LIMIT 1`,
        [parsed.adId, parsed.eventType, parsed.page, session.id]
      );

      if (recent.rows[0]) {
        deduped = true;
      } else {
        await pool.query(
          `INSERT INTO ad_events (ad_id, event_type, page, anonymous_session_id)
           VALUES ($1, $2, $3, $4)`,
          [parsed.adId, parsed.eventType, parsed.page, session.id]
        );
      }
    } catch (error) {
      if ((error as { code?: string }).code !== "42P01") {
        throw error;
      }
    }

    const response = NextResponse.json({ ok: true, deduped });
    if (session.created) {
      response.cookies.set("anonymous_session_id", session.id, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 180
      });
    }
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid payload" }, { status: 400 });
    }
    console.error("[api/ads/event][POST] error", error);
    return NextResponse.json({ error: "Failed to save ad event" }, { status: 500 });
  }
}

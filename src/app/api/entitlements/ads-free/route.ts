import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { pool } from "@/lib/db";
import { isUuid } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (!user?.id || !isUuid(user.id)) {
    return NextResponse.json(
      {
        adsFree: false,
        source: "stub"
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  try {
    const result = await pool.query(
      `SELECT status, current_period_end
       FROM entitlements
       WHERE key = 'ads_free'
         AND (
           (user_id = $1::uuid)
           OR (owner_type = 'user' AND owner_id = $2)
         )
       ORDER BY updated_at DESC
       LIMIT 1`,
      [user.id, user.id]
    );

    if (result.rows[0]) {
      const status = String(result.rows[0].status || "");
      const endRaw = result.rows[0].current_period_end ? new Date(result.rows[0].current_period_end) : null;
      const isActive = status === "active" && (!endRaw || endRaw.getTime() > Date.now());
      return NextResponse.json(
        {
          adsFree: isActive,
          source: "entitlements",
          currentPeriodEnd: endRaw ? endRaw.toISOString() : null
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }
  } catch (error) {
    if (!["42P01", "42703"].includes((error as { code?: string }).code || "")) {
      console.error("[entitlements/ads-free] unexpected error", error);
    }
  }

  return NextResponse.json(
    {
      adsFree: false,
      source: "stub"
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

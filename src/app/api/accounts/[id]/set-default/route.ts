export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";
import { requireUserId, UnauthorizedError } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

const setDefaultSchema = z.object({
  isDefault: z.boolean()
});

function parseAccountId(rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

export async function POST(request: Request, { params }: Params) {
  const ip = getClientIp(request);
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = checkRateLimit({ key: `accounts:set-default:${userId}:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const id = parseAccountId(params.id);
  if (!id) {
    return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    const payload = await request.json();
    const parsed = setDefaultSchema.parse(payload);

    await client.query("BEGIN");

    const existsResult = await client.query(
      "SELECT id FROM accounts WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (!existsResult.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (parsed.isDefault) {
      await client.query("UPDATE accounts SET is_default = false WHERE user_id = $1", [userId]);
      await client.query("UPDATE accounts SET is_default = true WHERE id = $1 AND user_id = $2", [id, userId]);
    } else {
      await client.query("UPDATE accounts SET is_default = false WHERE id = $1 AND user_id = $2", [id, userId]);
    }

    const defaultResult = await client.query(
      "SELECT id FROM accounts WHERE is_default = true AND user_id = $1 ORDER BY id ASC LIMIT 1",
      [userId]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      defaultAccountId: defaultResult.rows[0]?.id ?? null
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid set-default payload" },
        { status: 400 }
      );
    }
    console.error("[api/accounts/:id/set-default][POST] error", error);
    return NextResponse.json(
      { error: "Failed to update default account" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

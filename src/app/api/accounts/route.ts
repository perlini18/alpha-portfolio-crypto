export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { pool } from "@/lib/db";
import { decryptText, encryptText } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAccountSchema } from "@/lib/schemas";
import { getClientIp } from "@/lib/security";
import { requireUserId, UnauthorizedError } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = getClientIp(request);
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[api/accounts][GET] failed to resolve authenticated user", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit({ key: `accounts:get:${userId}:${ip}`, limit: 120, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id,
              name,
              CASE
                WHEN kind IN ('exchange', 'fiat') THEN kind
                WHEN kind = 'FIAT_CASH' THEN 'fiat'
                ELSE 'exchange'
              END AS kind,
              base_currency,
              notes,
              COALESCE(is_default, false) AS is_default,
              created_at
       FROM accounts
       WHERE user_id = $1
       ORDER BY is_default DESC, name ASC`,
      [userId]
    );

    const safeRows = Array.isArray(rows)
      ? rows.map((row) => ({
          ...row,
          notes: decryptText(row.notes)
        }))
      : [];
    return NextResponse.json(safeRows);
  } catch (error) {
    console.error("[api/accounts][GET] database error", error);
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[api/accounts][POST] failed to resolve authenticated user", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit({ key: `accounts:post:${userId}:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const client = await pool.connect();

  try {
    const payload = await request.json();
    const parsed = createAccountSchema.parse(payload);

    await client.query("BEGIN");

    if (parsed.is_default) {
      await client.query("UPDATE accounts SET is_default = false WHERE user_id = $1", [userId]);
    }

    const insertResult = await client.query(
      `INSERT INTO accounts (user_id, name, kind, base_currency, notes, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, kind, base_currency, notes, is_default, created_at`,
      [
        userId,
        parsed.name,
        parsed.kind,
        parsed.baseCurrency,
        encryptText(parsed.notes ?? null),
        parsed.is_default
      ]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      { ...insertResult.rows[0], notes: decryptText(insertResult.rows[0]?.notes) },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid account payload"
        },
        { status: 400 }
      );
    }

    console.error("[api/accounts][POST] database error", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  } finally {
    client.release();
  }
}

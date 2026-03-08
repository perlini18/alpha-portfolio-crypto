import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { pool } from "@/lib/db";
import { decryptText, encryptText } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { updateAccountSchema } from "@/lib/schemas";
import { getClientIp } from "@/lib/security";
import { requireUserId, UnauthorizedError } from "@/lib/requireUser";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

function parseAccountId(rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

export async function PATCH(request: Request, { params }: Params) {
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
  const rl = checkRateLimit({ key: `accounts:patch:${userId}:${ip}`, limit: 40, windowMs: 60_000 });
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
    const parsed = updateAccountSchema.parse(payload);

    const sets: string[] = [];
    const values: Array<string | boolean | null | number> = [id, userId];

    if (parsed.name !== undefined) {
      values.push(parsed.name);
      sets.push(`name = $${values.length}`);
    }

    if (parsed.kind !== undefined) {
      values.push(parsed.kind);
      sets.push(`kind = $${values.length}`);
    }

    if (parsed.baseCurrency !== undefined) {
      values.push(parsed.baseCurrency);
      sets.push(`base_currency = $${values.length}`);
    }

    if (parsed.notes !== undefined) {
      values.push(encryptText(parsed.notes ?? null));
      sets.push(`notes = $${values.length}`);
    }

    if (parsed.is_default !== undefined) {
      values.push(parsed.is_default);
      sets.push(`is_default = $${values.length}`);
    }

    await client.query("BEGIN");

    if (parsed.is_default === true) {
      await client.query("UPDATE accounts SET is_default = false WHERE user_id = $1", [userId]);
    }

    if (sets.length > 0) {
      await client.query(
        `UPDATE accounts
         SET ${sets.join(", ")}
         WHERE id = $1 AND user_id = $2`,
        values
      );
    }

    const { rows } = await client.query(
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
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await client.query("COMMIT");
    return NextResponse.json({ ...rows[0], notes: decryptText(rows[0].notes) });
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

    console.error("[api/accounts/:id][PATCH] database error", error);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request, { params }: Params) {
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
  const rl = checkRateLimit({ key: `accounts:delete:${userId}:${ip}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const id = parseAccountId(params.id);
  if (!id) {
    return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
  }

  const txCountResult = await pool.query(
    "SELECT COUNT(*)::int AS count FROM transactions WHERE account_id = $1 AND user_id = $2",
    [id, userId]
  );

  if ((txCountResult.rows[0]?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete account with transactions" },
      { status: 409 }
    );
  }

  const { rowCount } = await pool.query("DELETE FROM accounts WHERE id = $1 AND user_id = $2", [id, userId]);

  if (!rowCount) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

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
  const id = parseAccountId(params.id);
  if (!id) {
    return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    const payload = await request.json();
    const parsed = setDefaultSchema.parse(payload);

    await client.query("BEGIN");

    await client.query(
      "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false"
    );

    const existsResult = await client.query("SELECT id FROM accounts WHERE id = $1", [id]);
    if (!existsResult.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (parsed.isDefault) {
      await client.query("UPDATE accounts SET is_default = false WHERE is_default = true");
      await client.query("UPDATE accounts SET is_default = true WHERE id = $1", [id]);
    } else {
      await client.query("UPDATE accounts SET is_default = false WHERE id = $1", [id]);
    }

    // Keep one-or-zero default invariant at DB level.
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_default
       ON accounts ((is_default))
       WHERE is_default = TRUE`
    );

    const defaultResult = await client.query(
      "SELECT id FROM accounts WHERE is_default = true ORDER BY id ASC LIMIT 1"
    );

    await client.query("COMMIT");

    return NextResponse.json({
      defaultAccountId: defaultResult.rows[0]?.id ?? null
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: "Invalid set-default payload", details: String(error) },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

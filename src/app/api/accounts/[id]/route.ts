import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { pool } from "@/lib/db";
import { updateAccountSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

interface AccountColumns {
  kind: boolean;
  notes: boolean;
  isDefault: boolean;
}

function parseAccountId(rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

async function getAccountColumns(): Promise<AccountColumns> {
  const { rows } = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'accounts'
       AND column_name IN ('kind', 'notes', 'is_default')`
  );

  const names = new Set(rows.map((row) => row.column_name));
  return {
    kind: names.has("kind"),
    notes: names.has("notes"),
    isDefault: names.has("is_default")
  };
}

function selectAccountById(columns: AccountColumns) {
  return `SELECT id,
                 name,
                 ${
                   columns.kind
                     ? `CASE
                          WHEN kind IN ('exchange', 'fiat') THEN kind
                          WHEN kind = 'FIAT_CASH' THEN 'fiat'
                          ELSE 'exchange'
                        END AS kind`
                     : "'exchange'::text AS kind"
                 },
                 base_currency,
                 ${columns.notes ? "notes" : "NULL::text AS notes"},
                 ${columns.isDefault ? "is_default" : "false AS is_default"},
                 created_at
          FROM accounts
          WHERE id = $1`;
}

export async function PATCH(request: Request, { params }: Params) {
  const id = parseAccountId(params.id);
  if (!id) {
    return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    const payload = await request.json();
    const parsed = updateAccountSchema.parse(payload);
    const columns = await getAccountColumns();

    const sets: string[] = [];
    const values: Array<string | boolean | null | number> = [id];

    if (parsed.name !== undefined) {
      values.push(parsed.name);
      sets.push(`name = $${values.length}`);
    }

    if (parsed.kind !== undefined && columns.kind) {
      values.push(parsed.kind);
      sets.push(`kind = $${values.length}`);
    }

    if (parsed.baseCurrency !== undefined) {
      values.push(parsed.baseCurrency);
      sets.push(`base_currency = $${values.length}`);
    }

    if (parsed.notes !== undefined && columns.notes) {
      values.push(parsed.notes ?? null);
      sets.push(`notes = $${values.length}`);
    }

    if (parsed.is_default !== undefined && columns.isDefault) {
      values.push(parsed.is_default);
      sets.push(`is_default = $${values.length}`);
    }

    await client.query("BEGIN");

    if (parsed.is_default === true && columns.isDefault) {
      await client.query("UPDATE accounts SET is_default = false WHERE is_default = true");
    }

    if (sets.length > 0) {
      await client.query(
        `UPDATE accounts
         SET ${sets.join(", ")}
         WHERE id = $1`,
        values
      );
    }

    const { rows } = await client.query(selectAccountById(columns), [id]);

    if (!rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await client.query("COMMIT");
    return NextResponse.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");

    if (error instanceof ZodError) {
      const hasKindError = error.issues.some((issue) => issue.path.includes("kind"));
      if (hasKindError) {
        return NextResponse.json(
          {
            error: "Invalid account kind. Allowed values: exchange, fiat"
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Invalid account payload", details: String(error) },
      { status: 400 }
    );
  } finally {
    client.release();
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const id = parseAccountId(params.id);
  if (!id) {
    return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
  }

  const txCountResult = await pool.query(
    "SELECT COUNT(*)::int AS count FROM transactions WHERE account_id = $1",
    [id]
  );

  if ((txCountResult.rows[0]?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete account with transactions" },
      { status: 409 }
    );
  }

  const { rowCount } = await pool.query("DELETE FROM accounts WHERE id = $1", [id]);

  if (!rowCount) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

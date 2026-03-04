import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { pool } from "@/lib/db";
import { createAccountSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

interface AccountColumns {
  kind: boolean;
  notes: boolean;
  isDefault: boolean;
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

function buildAccountsSelect(columns: AccountColumns) {
  const kindExpr = columns.kind
    ? `CASE
         WHEN kind IN ('exchange', 'fiat') THEN kind
         WHEN kind = 'FIAT_CASH' THEN 'fiat'
         ELSE 'exchange'
       END AS kind`
    : "'exchange'::text AS kind";
  const notesExpr = columns.notes ? "notes" : "NULL::text AS notes";
  const defaultExpr = columns.isDefault ? "is_default" : "false AS is_default";
  const orderBy = columns.isDefault ? "ORDER BY is_default DESC, name ASC" : "ORDER BY name ASC";

  return `SELECT id, name, ${kindExpr}, base_currency, ${notesExpr}, ${defaultExpr}, created_at
          FROM accounts
          ${orderBy}`;
}

export async function GET() {
  const columns = await getAccountColumns();
  const { rows } = await pool.query(buildAccountsSelect(columns));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const client = await pool.connect();

  try {
    const payload = await request.json();
    const parsed = createAccountSchema.parse(payload);
    const columns = await getAccountColumns();

    await client.query("BEGIN");

    if (parsed.is_default && columns.isDefault) {
      await client.query("UPDATE accounts SET is_default = false WHERE is_default = true");
    }

    const insertCols = ["name", "base_currency"];
    const values: Array<string | boolean | null> = [parsed.name, parsed.baseCurrency];

    if (columns.kind) {
      insertCols.push("kind");
      values.push(parsed.kind);
    }

    if (columns.notes) {
      insertCols.push("notes");
      values.push(parsed.notes ?? null);
    }

    if (columns.isDefault) {
      insertCols.push("is_default");
      values.push(parsed.is_default);
    }

    const placeholders = insertCols.map((_, idx) => `$${idx + 1}`);

    const insertResult = await client.query(
      `INSERT INTO accounts (${insertCols.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING id`,
      values
    );

    const accountId = insertResult.rows[0]?.id;

    const { rows } = await client.query(
      `SELECT id,
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
       WHERE id = $1`,
      [accountId]
    );

    await client.query("COMMIT");
    return NextResponse.json(rows[0], { status: 201 });
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

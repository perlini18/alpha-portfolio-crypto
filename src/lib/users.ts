import crypto from "crypto";
import { pool } from "@/lib/db";

export interface DbUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function ensureUsersTable() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      name TEXT NULL,
      image TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
     ON users (LOWER(email))`
  );
}

export async function upsertUserFromProfile(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<DbUser> {
  const email = normalizeEmail(input.email);
  const id = crypto.randomUUID();

  try {
    const { rows } = await pool.query<DbUser>(
      `INSERT INTO users (id, email, name, image, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT ((LOWER(email)))
       DO UPDATE SET
         name = COALESCE(EXCLUDED.name, users.name),
         image = COALESCE(EXCLUDED.image, users.image),
         updated_at = NOW()
       RETURNING id, email, name, image`,
      [id, email, input.name ?? null, input.image ?? null]
    );
    return rows[0];
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") {
      throw error;
    }
    await ensureUsersTable();
    const { rows } = await pool.query<DbUser>(
      `INSERT INTO users (id, email, name, image, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT ((LOWER(email)))
       DO UPDATE SET
         name = COALESCE(EXCLUDED.name, users.name),
         image = COALESCE(EXCLUDED.image, users.image),
         updated_at = NOW()
       RETURNING id, email, name, image`,
      [id, email, input.name ?? null, input.image ?? null]
    );
    return rows[0];
  }
}

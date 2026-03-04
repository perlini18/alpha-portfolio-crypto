import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL client error", err);
});

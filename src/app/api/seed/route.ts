import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO accounts (name, base_currency)
       VALUES
         ('Binance', 'USD'),
         ('GBM', 'USD')
       ON CONFLICT DO NOTHING`
    );

    await client.query(
      `INSERT INTO assets (symbol, name, type, provider_id, coingecko_id, coingecko_symbol, provider, last_price)
       VALUES
         ('ETH', 'Ethereum', 'crypto', 'ethereum', 'ethereum', 'eth', 'coingecko', 3200),
         ('BNB', 'BNB', 'crypto', 'binancecoin', 'binancecoin', 'bnb', 'coingecko', 410),
         ('ADA', 'Cardano', 'crypto', 'cardano', 'cardano', 'ada', 'coingecko', 0.78)
       ON CONFLICT (symbol) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         provider_id = COALESCE(EXCLUDED.provider_id, assets.provider_id),
         coingecko_id = COALESCE(EXCLUDED.coingecko_id, assets.coingecko_id),
         coingecko_symbol = COALESCE(EXCLUDED.coingecko_symbol, assets.coingecko_symbol),
         provider = COALESCE(EXCLUDED.provider, assets.provider),
         last_price = EXCLUDED.last_price,
         updated_at = NOW()`
    );

    const accounts = await client.query("SELECT id, name FROM accounts WHERE name IN ('Binance', 'GBM')");
    const byName = new Map<string, number>();
    for (const row of accounts.rows) {
      byName.set(row.name, row.id);
    }

    const binanceId = byName.get("Binance");
    const gbmId = byName.get("GBM");

    if (!binanceId || !gbmId) {
      throw new Error("Failed to resolve seeded account ids");
    }

    await client.query(
      `INSERT INTO transactions
        (datetime, type, account_id, asset_symbol, quantity, price, fee_amount, fee_currency, notes)
       VALUES
        ('2025-08-01T10:00:00Z', 'BUY', $1, 'ETH', 0.8, 2800, 5, 'USD', 'Initial ETH buy'),
        ('2025-09-14T11:30:00Z', 'BUY', $1, 'BNB', 4.0, 360, 2, 'USD', 'BNB accumulation'),
        ('2025-10-02T15:00:00Z', 'BUY', $2, 'ADA', 2000, 0.55, 1, 'USD', 'ADA position'),
        ('2025-11-20T13:40:00Z', 'SELL', $1, 'ETH', 0.2, 3400, 4, 'USD', 'Partial ETH sell'),
        ('2025-12-05T09:20:00Z', 'SELL', $2, 'ADA', 500, 0.72, 1, 'USD', 'Trim ADA')`,
      [binanceId, gbmId]
    );

    await client.query("COMMIT");

    return NextResponse.json({ message: "Seed inserted" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[api/seed][POST] error", error);
    return NextResponse.json(
      { error: "Seed failed" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

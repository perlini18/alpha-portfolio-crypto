import { pool } from "@/lib/db";
import { isUuid } from "@/lib/requireUser";

interface EntitlementQueryResult {
  adsFree: boolean;
  currentPeriodEnd: string | null;
}

export async function getAdsFreeStatus(ownerType: string, ownerId: string): Promise<EntitlementQueryResult> {
  const { rows } = await pool.query(
    `SELECT status, current_period_end
     FROM entitlements
     WHERE owner_type = $1
       AND owner_id = $2
       AND key = 'ads_free'
     LIMIT 1`,
    [ownerType, ownerId]
  );

  if (!rows[0]) {
    return { adsFree: false, currentPeriodEnd: null };
  }

  const status = String(rows[0].status || "");
  const currentPeriodEnd = rows[0].current_period_end ? new Date(rows[0].current_period_end).toISOString() : null;
  const activeByTime = !rows[0].current_period_end || new Date(rows[0].current_period_end).getTime() > Date.now();
  const adsFree = status === "active" && activeByTime;

  return {
    adsFree,
    currentPeriodEnd
  };
}

export async function upsertAdsFreeEntitlement(params: {
  ownerType: string;
  ownerId: string;
  status: "active" | "canceled" | "expired";
  provider: "stripe" | "crypto" | "manual";
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  currentPeriodEnd?: string | Date | null;
}) {
  const userId = params.ownerType === "user" && isUuid(params.ownerId) ? params.ownerId : null;
  const endValue =
    params.currentPeriodEnd instanceof Date
      ? params.currentPeriodEnd.toISOString()
      : params.currentPeriodEnd || null;

  await pool.query(
    `INSERT INTO entitlements
      (owner_type, owner_id, user_id, key, status, provider, provider_customer_id, provider_subscription_id, current_period_end, created_at, updated_at)
     VALUES
      ($1, $2, $3, 'ads_free', $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (owner_type, owner_id, key)
     DO UPDATE SET
      user_id = COALESCE(EXCLUDED.user_id, entitlements.user_id),
      status = EXCLUDED.status,
      provider = EXCLUDED.provider,
      provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, entitlements.provider_customer_id),
      provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, entitlements.provider_subscription_id),
      current_period_end = COALESCE(EXCLUDED.current_period_end, entitlements.current_period_end),
      updated_at = NOW()`,
    [
      params.ownerType,
      params.ownerId,
      userId,
      params.status,
      params.provider,
      params.providerCustomerId || null,
      params.providerSubscriptionId || null,
      endValue
    ]
  );
}

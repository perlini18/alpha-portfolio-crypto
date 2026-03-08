import { NextResponse } from "next/server";
import { upsertAdsFreeEntitlement } from "@/lib/entitlements";
import { retrieveSubscription, verifyStripeWebhookSignature } from "@/lib/stripe";

export const dynamic = "force-dynamic";

function readMetadata(source: Record<string, unknown> | null | undefined) {
  const metadata = (source?.metadata || {}) as Record<string, unknown>;
  const ownerType = String(metadata.owner_type || "");
  const ownerId = String(metadata.owner_id || "");
  const key = String(metadata.key || "");
  return { ownerType, ownerId, key };
}

function toIsoFromUnix(value: unknown) {
  const unix = Number(value || 0);
  if (!Number.isFinite(unix) || unix <= 0) {
    return null;
  }
  return new Date(unix * 1000).toISOString();
}

function mapStripeSubscriptionStatus(statusRaw: unknown, periodEndIso: string | null): "active" | "canceled" | "expired" {
  const status = String(statusRaw || "").toLowerCase();
  if (status === "canceled" || status === "unpaid") {
    return "canceled";
  }
  if (periodEndIso && new Date(periodEndIso).getTime() <= Date.now()) {
    return "expired";
  }
  return "active";
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const verified = verifyStripeWebhookSignature(rawBody, signature);
    if (!verified) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } catch (error) {
    console.error("[api/webhooks/stripe][POST] configuration error", error);
    return NextResponse.json({ error: "Webhook configuration error" }, { status: 500 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const eventType = String(event.type || "");
  const object = ((event.data as { object?: Record<string, unknown> })?.object || null) as Record<string, unknown> | null;

  try {
    if (eventType === "checkout.session.completed" && object) {
      const sessionMetadata = readMetadata(object);
      let ownerType = sessionMetadata.ownerType;
      let ownerId = sessionMetadata.ownerId;
      const subIdRaw = object.subscription;
      const customerId = object.customer ? String(object.customer) : null;

      let periodEnd: string | null = null;
      let subscriptionId: string | null = null;

      if (typeof subIdRaw === "string" && subIdRaw.trim()) {
        const subscription = await retrieveSubscription(subIdRaw);
        const subMetadata = readMetadata(subscription);
        ownerType = ownerType || subMetadata.ownerType;
        ownerId = ownerId || subMetadata.ownerId;
        periodEnd = toIsoFromUnix(subscription.current_period_end);
        subscriptionId = String(subscription.id || subIdRaw);
      }

      if (ownerType && ownerId && (!sessionMetadata.key || sessionMetadata.key === "ads_free")) {
        await upsertAdsFreeEntitlement({
          ownerType,
          ownerId,
          status: "active",
          provider: "stripe",
          providerCustomerId: customerId,
          providerSubscriptionId: subscriptionId,
          currentPeriodEnd: periodEnd
        });
      }
    }

    if ((eventType === "customer.subscription.created" || eventType === "customer.subscription.updated") && object) {
      const metadata = readMetadata(object);
      if (metadata.key === "ads_free" && metadata.ownerType && metadata.ownerId) {
        const periodEnd = toIsoFromUnix(object.current_period_end);
        await upsertAdsFreeEntitlement({
          ownerType: metadata.ownerType,
          ownerId: metadata.ownerId,
          status: mapStripeSubscriptionStatus(object.status, periodEnd),
          provider: "stripe",
          providerCustomerId: object.customer ? String(object.customer) : null,
          providerSubscriptionId: object.id ? String(object.id) : null,
          currentPeriodEnd: periodEnd
        });
      }
    }

    if (eventType === "customer.subscription.deleted" && object) {
      const metadata = readMetadata(object);
      if (metadata.key === "ads_free" && metadata.ownerType && metadata.ownerId) {
        await upsertAdsFreeEntitlement({
          ownerType: metadata.ownerType,
          ownerId: metadata.ownerId,
          status: "canceled",
          provider: "stripe",
          providerCustomerId: object.customer ? String(object.customer) : null,
          providerSubscriptionId: object.id ? String(object.id) : null,
          currentPeriodEnd: toIsoFromUnix(object.current_period_end)
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[api/webhooks/stripe][POST] processing error", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

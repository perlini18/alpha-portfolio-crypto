import crypto from "node:crypto";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

function getStripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Stripe is not configured");
  }
  return key;
}

async function stripeFormRequest(path: string, data: URLSearchParams) {
  const secretKey = getStripeSecretKey();
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: data.toString(),
    cache: "no-store"
  });

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    const message = typeof json?.error === "object" && json?.error && "message" in json.error
      ? String((json.error as { message?: string }).message || "Stripe API error")
      : "Stripe API error";
    throw new Error(message);
  }

  return json || {};
}

async function stripeGetRequest(path: string) {
  const secretKey = getStripeSecretKey();
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`
    },
    cache: "no-store"
  });

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof json?.error === "object" && json?.error && "message" in json.error
      ? String((json.error as { message?: string }).message || "Stripe API error")
      : "Stripe API error";
    throw new Error(message);
  }
  return json || {};
}

export async function createAdsFreeCheckoutSession(params: {
  ownerType: string;
  ownerId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const priceId = process.env.STRIPE_PRICE_ID_ADS_FREE_MONTHLY?.trim();
  if (!priceId) {
    throw new Error("STRIPE_PRICE_ID_ADS_FREE_MONTHLY is not configured");
  }

  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  body.set("metadata[owner_type]", params.ownerType);
  body.set("metadata[owner_id]", params.ownerId);
  body.set("metadata[key]", "ads_free");
  body.set("subscription_data[metadata][owner_type]", params.ownerType);
  body.set("subscription_data[metadata][owner_id]", params.ownerId);
  body.set("subscription_data[metadata][key]", "ads_free");

  const session = await stripeFormRequest("/checkout/sessions", body);
  return {
    id: String(session.id || ""),
    url: String(session.url || "")
  };
}

export async function retrieveSubscription(subscriptionId: string) {
  const sub = await stripeGetRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  return sub;
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  if (!signatureHeader) {
    return false;
  }

  const elements = signatureHeader.split(",").map((part) => part.trim());
  const timestampPart = elements.find((part) => part.startsWith("t="));
  const signaturePart = elements.find((part) => part.startsWith("v1="));

  if (!timestampPart || !signaturePart) {
    return false;
  }

  const timestamp = timestampPart.slice(2);
  const signature = signaturePart.slice(3);
  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  if (expected.length !== signature.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

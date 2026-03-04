import { NextResponse } from "next/server";
import { z } from "zod";
import { applyOwnerCookie, getOrCreateOwner } from "@/lib/owner";
import { createAdsFreeCheckoutSession } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  returnPath: z
    .string()
    .trim()
    .optional()
    .transform((value) => {
      if (!value || !value.startsWith("/")) {
        return "/";
      }
      return value;
    })
});

export async function POST(request: Request) {
  const owner = getOrCreateOwner();
  let payload: z.infer<typeof payloadSchema>;

  try {
    const raw = (await request.json().catch(() => ({}))) as unknown;
    payload = payloadSchema.parse(raw);
  } catch {
    const response = NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    applyOwnerCookie(response, owner);
    return response;
  }

  try {
    const origin = new URL(request.url).origin;
    const normalizedPath = payload.returnPath.split("?")[0] || "/";
    const successUrl = `${origin}${normalizedPath}?billing=success`;
    const cancelUrl = `${origin}${normalizedPath}?billing=cancel`;

    const session = await createAdsFreeCheckoutSession({
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      successUrl,
      cancelUrl
    });

    const response = NextResponse.json({
      url: session.url,
      sessionId: session.id
    });
    applyOwnerCookie(response, owner);
    return response;
  } catch (error) {
    const response = NextResponse.json(
      {
        error: "Failed to create checkout session",
        details: String(error)
      },
      { status: 500 }
    );
    applyOwnerCookie(response, owner);
    return response;
  }
}

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const OWNER_COOKIE_NAME = "owner_device_id";
export const OWNER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface OwnerContext {
  ownerType: "user";
  ownerId: string;
  created: boolean;
}

export function getOwnerFromCookie(): OwnerContext | null {
  const cookieStore = cookies();
  const value = cookieStore.get(OWNER_COOKIE_NAME)?.value?.trim() || "";
  if (!value) {
    return null;
  }
  return {
    ownerType: "user",
    ownerId: value,
    created: false
  };
}

export function getOrCreateOwner(): OwnerContext {
  const existing = getOwnerFromCookie();
  if (existing) {
    return existing;
  }
  return {
    ownerType: "user",
    ownerId: crypto.randomUUID(),
    created: true
  };
}

export function applyOwnerCookie(response: NextResponse, owner: OwnerContext) {
  if (!owner.created) {
    return;
  }
  response.cookies.set(OWNER_COOKIE_NAME, owner.ownerId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: OWNER_COOKIE_MAX_AGE_SECONDS
  });
}

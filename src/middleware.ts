import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (pathname.startsWith("/api/auth/")) {
    const rl = checkRateLimit({
      key: `auth:${ip}:${pathname}`,
      limit: 40,
      windowMs: 60_000
    });
    if (!rl.allowed) {
      const limited = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      limited.headers.set("Retry-After", String(rl.retryAfterSec));
      setSecurityHeaders(limited);
      return limited;
    }
  }

  const protectedPath =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/portfolio") ||
    pathname.startsWith("/accounts") ||
    pathname.startsWith("/transactions") ||
    pathname.startsWith("/assets");

  if (protectedPath && !req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("from", pathname);
    const response = NextResponse.redirect(loginUrl);
    setSecurityHeaders(response);
    return response;
  }

  const response = NextResponse.next();
  setSecurityHeaders(response);
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"]
};


function setSecurityHeaders(response: NextResponse) {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "manifest-src 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    "connect-src 'self' https://api.coingecko.com https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com",
    "form-action 'self' https://accounts.google.com",
    "frame-src https://accounts.google.com"
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
}

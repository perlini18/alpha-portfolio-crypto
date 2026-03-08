export function maskEmail(email: string | null | undefined) {
  if (!email) {
    return "";
  }
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return email;
  }
  const head = local.slice(0, 3);
  return `${head}${local.length > 3 ? "***" : "*"}@${domain}`;
}

export function resolveSafeRedirect(url: string, baseUrl: string) {
  if (!url) {
    return `${baseUrl}/dashboard`;
  }

  if (url.startsWith("/")) {
    return `${baseUrl}${url}`;
  }

  try {
    const parsed = new URL(url);
    if (parsed.origin === baseUrl) {
      return parsed.toString();
    }
  } catch {
    return `${baseUrl}/dashboard`;
  }

  return `${baseUrl}/dashboard`;
}

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}

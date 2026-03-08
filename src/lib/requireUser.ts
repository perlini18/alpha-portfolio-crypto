import { auth } from "@/auth";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UnauthorizedError extends Error {
  status = 401;

  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export function isUuid(value: string) {
  return UUID_REGEX.test(value);
}

export async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id?.trim();

  if (!userId || !isUuid(userId)) {
    throw new UnauthorizedError();
  }

  return userId;
}

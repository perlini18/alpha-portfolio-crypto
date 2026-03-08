import { auth } from "@/auth";
import { upsertUserFromProfile } from "@/lib/users";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return null;
  }

  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (sessionUserId) {
    return {
      id: sessionUserId,
      email,
      name: session?.user?.name ?? null,
      image: session?.user?.image ?? null
    };
  }

  const dbUser = await upsertUserFromProfile({
    email,
    name: session?.user?.name ?? null,
    image: session?.user?.image ?? null
  });

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    image: dbUser.image
  };
}

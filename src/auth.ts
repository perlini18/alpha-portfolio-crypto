
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { resolveSafeRedirect } from "@/lib/security";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60
  },
  useSecureCookies: process.env.NODE_ENV === "production",
  trustHost: true,
  pages: {
    signIn: "/login"
  },
  callbacks: {
    async jwt({ token, user }) {
      const nextEmail = (user?.email ?? token.email ?? "").toString().trim().toLowerCase();
      const nextName = (user?.name ?? token.name ?? null) as string | null;
      const nextImage = (user?.image ?? token.picture ?? null) as string | null;

      token.email = nextEmail || undefined;
      token.name = nextName ?? undefined;
      token.picture = nextImage ?? undefined;

      // Only touch DB on sign-in events (user is present). Middleware/session checks
      // run on the Edge runtime and must not load Node-only modules.
      if (user && nextEmail) {
        try {
          const { upsertUserFromProfile } = await import("@/lib/users");
          const dbUser = await upsertUserFromProfile({
            email: nextEmail,
            name: nextName,
            image: nextImage
          });
          token.id = dbUser.id;
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("[auth] failed to upsert DB user", error);
          } else {
            console.error("[auth] failed to upsert DB user");
          }
          token.id = undefined;
        }
      }
      return token;
    },
    async redirect({ url, baseUrl }) {
      return resolveSafeRedirect(url, baseUrl);
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string | undefined;
        session.user.email = (token.email as string | null | undefined) ?? session.user.email;
        session.user.name = (token.name as string | null | undefined) ?? session.user.name;
        session.user.image = (token.picture as string | null | undefined) ?? session.user.image;
      }
      return session;
    }
  }
});

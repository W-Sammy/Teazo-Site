import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { findAuthorizedAdmin, normalizeEmail } from "@/app/lib/admin-whitelist";
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],

  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8-hour max session lifecycle
  },

  callbacks: {
    async signIn({ account, profile, user }) {
      if (
        account?.provider !== "google" ||
        profile?.email_verified !== true ||
        typeof profile.email !== "string"
      ) {
        return false;
      }

      const email = normalizeEmail(profile.email);

      try {
        const admin = await findAuthorizedAdmin(email);

        if (!admin) return false;

        // Use the verified, normalized Google email in the session.
        user.email = email;

        return true;
      } catch {
        console.error("Google sign-in authorization lookup failed.");

        // Returning a URL stops sign-in and redirects without creating
        // a new authenticated session.
        return "/login?error=ServiceUnavailable";
      }
    },

    jwt({ token, user }) {
      // user is supplied during initial sign-in.
      if (user?.email) {
        token.email = normalizeEmail(user.email);
      }

      return token;
    },

    session({ session, token }) {
      if (session.user && typeof token.email === "string") {
        session.user.email = token.email;
      }

      return session;
    },
  },
});

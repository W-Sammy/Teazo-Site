import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

import { findAdminCredentials } from "./app/lib/admin-credentials";
import { verifyPassword } from "./app/lib/password";

import { findAuthorizedAdmin, normalizeEmail } from "@/app/lib/admin-whitelist";
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        const { email, password } = credentials;

        // Values submitted by the browser must be checked server-side.
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const normalizedEmail = normalizeEmail(email);

        if (
          !normalizedEmail ||
          normalizedEmail.length > 254 ||
          password.length === 0 ||
          password.length > 1024
        ) {
          return null;
        }

        try {
          const admin = await findAdminCredentials(normalizedEmail);

          if (!admin) return null;

          const passwordMatches = await verifyPassword(
            password,
            admin.password_hash,
          );

          if (!passwordMatches) return null;

          // Only identity information enters Auth.js, never the hash.
          return {
            id: admin.id,
            name: admin.username,
            email: admin.email_normalized,
          };
        } catch {
          console.error("Credentials sign-in verification failed.");

          // A service failure is different from incorrect credentials.
          throw new Error("Credentials verification unavailable.");
        }
      },
    }),
  ],

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

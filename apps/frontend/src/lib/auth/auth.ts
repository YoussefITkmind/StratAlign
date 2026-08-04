import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { OAuthConfig } from "next-auth/providers";
import { findUserByEmail } from "@/server/mock-db";

/**
 * ⚠️ TEMPORARY STUB — for local UI development only.
 *
 * This is NOT Prompt 1.1. It exists only so `signIn()`/`signOut()` have
 * something to talk to while building/demoing the login page. Delete this
 * file's provider bodies once Person A lands the real Auth.js v5 config
 * (generic OIDC provider + `iam.local_credential`-backed Credentials
 * provider, argon2 hashing, PKCE, rate limiting — see Prompt 1.1).
 *
 * Demo credentials while this stub is in place:
 *   member:  demo@stratalign.dev  / password123
 *   admin:   admin@stratalign.dev / admin123
 *
 * The "oidc" provider below points at a local mock IdP (`app/api/mock-idp/*`,
 * `lib/mock-idp/store.ts`) that implements a real OAuth2 authorization-code +
 * PKCE exchange — not a client-side session bypass — since no real enterprise
 * IdP exists yet. Swap `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` for
 * the real IdP's values once Prompt 1.1 ships and delete the mock IdP files.
 */
const CREDENTIAL_PASSWORDS: Record<string, string> = {
  "demo@stratalign.dev": "password123",
  "admin@stratalign.dev": "admin123",
};

const MOCK_IDP_BASE =
  process.env.MOCK_IDP_BASE_URL ?? "http://localhost:3000/api/mock-idp";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // TODO(Person A): replace with argon2 verify against iam.local_credential.
        const email = typeof credentials?.email === "string" ? credentials.email : undefined;
        const password =
          typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password || CREDENTIAL_PASSWORDS[email] !== password) {
          return null; // -> surfaces as the "CredentialsSignin" error code
        }
        const user = findUserByEmail(email);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
    {
      // Generic OAuth2/PKCE provider pointed at the local mock IdP so
      // "Continue with SSO" exercises a real authorization-code round trip.
      id: "oidc",
      name: "SSO",
      type: "oauth",
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
      authorization: { url: `${MOCK_IDP_BASE}/authorize`, params: { scope: "openid email profile" } },
      token: `${MOCK_IDP_BASE}/token`,
      userinfo: `${MOCK_IDP_BASE}/userinfo`,
      checks: ["pkce", "state"],
      client: { token_endpoint_auth_method: "client_secret_post" },
      profile(profile: { sub: string; email: string; name: string; role: "platform_administrator" | "member" }) {
        return { id: profile.sub, email: profile.email, name: profile.name, role: profile.role };
      },
    } as OAuthConfig<{
      sub: string;
      email: string;
      name: string;
      role: "platform_administrator" | "member";
    }>,
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: "platform_administrator" | "member" }).role ?? "member";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? session.user.id;
        session.user.role = (token.role as "platform_administrator" | "member") ?? "member";
      }
      return session;
    },
  },
});

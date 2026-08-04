import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { trpcClient } from "./services/api-client";

const oidcIssuer = process.env.AUTH_OIDC_ISSUER;
const oidcClientId = process.env.AUTH_OIDC_CLIENT_ID;
const oidcClientSecret = process.env.AUTH_OIDC_CLIENT_SECRET;
const oidcScopes =
  process.env.AUTH_OIDC_SCOPES ?? "openid profile email";
const oidcTokenEndpointAuthMethod =
  process.env.AUTH_OIDC_TOKEN_ENDPOINT_AUTH_METHOD ??
  "client_secret_basic";

if (
  oidcTokenEndpointAuthMethod !== "client_secret_basic" &&
  oidcTokenEndpointAuthMethod !== "client_secret_post"
) {
  throw new Error(
    "AUTH_OIDC_TOKEN_ENDPOINT_AUTH_METHOD must be client_secret_basic or client_secret_post",
  );
}

if (!oidcIssuer || !oidcClientId || !oidcClientSecret) {
  throw new Error(
    "AUTH_OIDC_ISSUER, AUTH_OIDC_CLIENT_ID, and AUTH_OIDC_CLIENT_SECRET are required",
  );
}

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 15 * 60,
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    {
      id: "generic-oidc",
      name: "Continue with SSO",
      type: "oidc",
      issuer: oidcIssuer,
      clientId: oidcClientId,
      clientSecret: oidcClientSecret,
      client: {
        token_endpoint_auth_method: oidcTokenEndpointAuthMethod,
        },

      authorization: {
        params: {
          scope: oidcScopes,
        },
      },

      checks: ["pkce", "state"],

      profile(profile) {
        return {
          id: String(profile.sub),
          email:
            typeof profile.email === "string"
              ? profile.email
              : null,
          name:
            typeof profile.name === "string"
              ? profile.name
              : null,
        };
      },
    },

    Credentials({
      name: "Email and password",

      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        const email =
          typeof credentials.email === "string"
            ? credentials.email
            : "";

        const password =
          typeof credentials.password === "string"
            ? credentials.password
            : "";

        if (!email || !password) {
          return null;
        }

        try {
          const user = await trpcClient.auth.login.mutate({
            email,
            password,
          });

          return {
            id: user.id,
            email: user.email,
            name: user.displayName,
          };
        } catch {
          return null;
        }
      },
    }),
  ],

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }

      return token;
    },

    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }

      return session;
    },
  },
});
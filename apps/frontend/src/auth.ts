import NextAuth, { type Account, type NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
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

export const GENERIC_OIDC_PROVIDER_ID = "generic-oidc";
export const OIDC_REFRESH_ERROR = "OIDC_REFRESH_FAILED";

const ACCESS_TOKEN_EXPIRY_SKEW_MS = 30_000;

type OidcJwt = JWT & {
  oidcAccessToken?: string;
  oidcRefreshToken?: string;
  oidcAccessTokenExpiresAt?: number;
  oidcRefreshError?: typeof OIDC_REFRESH_ERROR;
  authenticationMethod?: "credentials" | "oidc";
};

type OidcDiscovery = {
  token_endpoint: string;
  end_session_endpoint?: string;
};

let oidcDiscoveryPromise: Promise<OidcDiscovery> | null = null;

async function getOidcDiscovery(): Promise<OidcDiscovery> {
  oidcDiscoveryPromise ??= fetch(
    `${oidcIssuer!.replace(/\/$/, "")}/.well-known/openid-configuration`,
    { cache: "force-cache" },
  ).then(async (response) => {
    if (!response.ok) throw new Error("OIDC discovery failed");
    const metadata = await response.json() as {
      token_endpoint?: unknown;
      end_session_endpoint?: unknown;
    };
    if (typeof metadata.token_endpoint !== "string") {
      throw new Error("OIDC discovery failed");
    }
    return {
      token_endpoint: metadata.token_endpoint,
      end_session_endpoint:
        typeof metadata.end_session_endpoint === "string"
          ? metadata.end_session_endpoint
          : undefined,
    };
  });

  return oidcDiscoveryPromise;
}

export function safePostLogoutUrl(candidate: string | null): string {
  const applicationUrl = new URL(process.env.AUTH_URL ?? "http://localhost:3000");
  if (!candidate) return new URL("/login", applicationUrl).toString();

  try {
    const requested = new URL(candidate, applicationUrl);
    return requested.origin === applicationUrl.origin
      ? requested.toString()
      : new URL("/login", applicationUrl).toString();
  } catch {
    return new URL("/login", applicationUrl).toString();
  }
}

export async function oidcLogoutUrl(
  postLogoutRedirectUri: string,
): Promise<string | null> {
  try {
    const endpoint = (await getOidcDiscovery()).end_session_endpoint;
    return buildProviderLogoutUrl(endpoint, postLogoutRedirectUri);
  } catch {
    return null;
  }
}

export function buildProviderLogoutUrl(
  endpoint: string | undefined,
  postLogoutRedirectUri: string,
): string | null {
  if (!endpoint) return null;
  const logout = new URL(endpoint);
  logout.searchParams.set(
    "post_logout_redirect_uri",
    safePostLogoutUrl(postLogoutRedirectUri),
  );
  return logout.toString();
}

function captureOidcTokens(token: OidcJwt, account: Account): OidcJwt {
  if (typeof account.access_token === "string") {
    token.oidcAccessToken = account.access_token;
  }
  if (typeof account.refresh_token === "string") {
    token.oidcRefreshToken = account.refresh_token;
  }
  if (typeof account.expires_at === "number") {
    token.oidcAccessTokenExpiresAt = account.expires_at * 1_000;
  }
  delete token.oidcRefreshError;
  return token;
}

export async function refreshOidcToken(
  token: OidcJwt,
  fetcher: typeof fetch = fetch,
): Promise<OidcJwt> {
  if (!token.oidcRefreshToken) {
    return { ...token, oidcRefreshError: OIDC_REFRESH_ERROR };
  }

  try {
    const tokenEndpoint = (await getOidcDiscovery()).token_endpoint;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.oidcRefreshToken,
      client_id: oidcClientId!,
    });
    const headers = new Headers({
      "content-type": "application/x-www-form-urlencoded",
    });

    if (oidcTokenEndpointAuthMethod === "client_secret_basic") {
      headers.set(
        "authorization",
        `Basic ${Buffer.from(`${oidcClientId}:${oidcClientSecret}`).toString("base64")}`,
      );
    } else {
      body.set("client_secret", oidcClientSecret!);
    }

    const response = await fetcher(tokenEndpoint, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("OIDC refresh failed");
    const refreshed = await response.json() as Record<string, unknown>;
    if (
      typeof refreshed.access_token !== "string" ||
      refreshed.access_token.length === 0 ||
      typeof refreshed.expires_in !== "number" ||
      !Number.isFinite(refreshed.expires_in) ||
      refreshed.expires_in <= 0
    ) {
      throw new Error("OIDC refresh failed");
    }

    const healthyToken = { ...token };
    delete healthyToken.oidcRefreshError;

    return {
      ...healthyToken,
      oidcAccessToken: refreshed.access_token,
      oidcRefreshToken:
        typeof refreshed.refresh_token === "string" &&
        refreshed.refresh_token.length > 0
          ? refreshed.refresh_token
          : token.oidcRefreshToken,
      oidcAccessTokenExpiresAt: Date.now() + refreshed.expires_in * 1_000,
    };
  } catch {
    const failedToken = { ...token };
    delete failedToken.oidcAccessToken;

    return {
      ...failedToken,
      oidcRefreshError: OIDC_REFRESH_ERROR,
    };
  }
}

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

export const authCallbacks = {
  async signIn({ user, account }) {
    if (account?.provider !== GENERIC_OIDC_PROVIDER_ID) {
      return true;
    }

    const idToken = account.id_token;

    if (typeof idToken !== "string" || idToken.trim().length === 0) {
      return false;
    }

    try {
      const platformUser =
        await trpcClient.auth.reconcileOidc.mutate({ idToken });

      user.id = platformUser.id;
      user.email = platformUser.email;
      user.name = platformUser.displayName;
      user.image = null;

      return true;
    } catch {
      return false;
    }
  },

  async jwt({ token, user, account }) {
    const oidcToken = token as OidcJwt;

    if (user) {
      oidcToken.sub = user.id;
    }

    if (account?.provider === GENERIC_OIDC_PROVIDER_ID) {
      captureOidcTokens(oidcToken, account);
      oidcToken.authenticationMethod = "oidc";
    } else if (account?.provider === "credentials") {
      delete oidcToken.oidcAccessToken;
      delete oidcToken.oidcRefreshToken;
      delete oidcToken.oidcAccessTokenExpiresAt;
      delete oidcToken.oidcRefreshError;
      oidcToken.authenticationMethod = "credentials";
    } else if (
      oidcToken.oidcAccessTokenExpiresAt !== undefined &&
      Date.now() >= oidcToken.oidcAccessTokenExpiresAt - ACCESS_TOKEN_EXPIRY_SKEW_MS
    ) {
      return refreshOidcToken(oidcToken);
    }

    delete oidcToken.id_token;
    delete oidcToken.access_token;
    delete oidcToken.refresh_token;

    return oidcToken;
  },

  session({ session, token }) {
    const oidcToken = token as OidcJwt;

    if (oidcToken.oidcRefreshError) {
      return null as unknown as typeof session;
    }

    if (session.user && token.sub) {
      session.user.id = token.sub;
    }

    Object.assign(session, {
      authenticationMethod: oidcToken.authenticationMethod,
    });

    return session;
  },
} satisfies NonNullable<NextAuthConfig["callbacks"]>;

export const authConfig = {
  session: {
    strategy: "jwt",
    maxAge: 15 * 60,
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    {
      id: GENERIC_OIDC_PROVIDER_ID,
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

  callbacks: authCallbacks,
} satisfies NextAuthConfig;

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth(authConfig);

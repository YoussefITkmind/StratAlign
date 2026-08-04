/**
 * ⚠️ MOCK IDENTITY PROVIDER — LOCAL DEV/TEST FIXTURE ONLY.
 *
 * There is no real enterprise IdP configured for this project yet (no
 * `OIDC_ISSUER` from Prompt 1.1). This in-memory store backs a minimal
 * standalone OAuth2 authorization-code + PKCE flow (see the sibling routes
 * under `app/api/mock-idp/*`) so "Continue with SSO" exercises a REAL
 * multi-hop redirect/token exchange instead of a client-side session bypass.
 * Swap `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` for the real IdP's
 * values once Prompt 1.1 ships, and delete `app/api/mock-idp/*` + this file.
 */
import { randomBytes, createHash } from "crypto";

export type PendingAuthCode = {
  sub: string;
  email: string;
  name: string;
  role: "platform_administrator" | "member";
  redirectUri: string;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: number;
};

export type AccessTokenRecord = {
  sub: string;
  email: string;
  name: string;
  role: "platform_administrator" | "member";
  expiresAt: number;
};

/**
 * Next.js dev mode compiles each Route Handler as its own webpack entry, so a
 * plain module-level `new Map()` can end up duplicated across the authorize/
 * confirm/token/userinfo routes whenever only some of them recompile (state
 * silently resets, authorization codes "disappear"). Anchoring to
 * `globalThis` guarantees every entry point reads/writes the same object,
 * the same fix used for singletons like a dev-mode Prisma client.
 */
const globalForMockIdp = globalThis as unknown as {
  __mockIdpAuthorizationCodes?: Map<string, PendingAuthCode>;
  __mockIdpAccessTokens?: Map<string, AccessTokenRecord>;
};

export const authorizationCodes =
  globalForMockIdp.__mockIdpAuthorizationCodes ?? new Map<string, PendingAuthCode>();
export const accessTokens =
  globalForMockIdp.__mockIdpAccessTokens ?? new Map<string, AccessTokenRecord>();

globalForMockIdp.__mockIdpAuthorizationCodes = authorizationCodes;
globalForMockIdp.__mockIdpAccessTokens = accessTokens;

export function randomToken() {
  return randomBytes(24).toString("hex");
}

function base64url(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function verifyPkce(codeVerifier: string, codeChallenge: string, method: string) {
  if (method === "plain") return codeVerifier === codeChallenge;
  const hash = createHash("sha256").update(codeVerifier).digest();
  return base64url(hash) === codeChallenge;
}

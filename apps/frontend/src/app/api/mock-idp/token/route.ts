import { NextResponse } from "next/server";
import { accessTokens, authorizationCodes, randomToken, verifyPkce } from "@/lib/mock-idp/store";

export async function POST(req: Request) {
  const form = await req.formData();
  const grantType = form.get("grant_type");
  const code = String(form.get("code") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const clientSecret = String(form.get("client_secret") ?? "");
  const codeVerifier = String(form.get("code_verifier") ?? "");

  if (grantType !== "authorization_code") {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  }
  if (clientId !== process.env.OIDC_CLIENT_ID || clientSecret !== process.env.OIDC_CLIENT_SECRET) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }

  const entry = authorizationCodes.get(code);
  if (!entry || entry.expiresAt < Date.now()) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
  authorizationCodes.delete(code); // single use

  if (entry.redirectUri !== redirectUri || entry.clientId !== clientId) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
  if (!verifyPkce(codeVerifier, entry.codeChallenge, entry.codeChallengeMethod)) {
    return NextResponse.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, { status: 400 });
  }

  const accessToken = randomToken();
  accessTokens.set(accessToken, {
    sub: entry.sub,
    email: entry.email,
    name: entry.name,
    role: entry.role,
    expiresAt: Date.now() + 5 * 60_000,
  });

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 300,
    scope: "openid email profile",
  });
}

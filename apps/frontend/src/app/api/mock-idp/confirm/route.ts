import { NextResponse } from "next/server";
import { authorizationCodes, randomToken } from "@/lib/mock-idp/store";
import { findMockIdpUser } from "@/lib/mock-idp/users";

const SUBJECT_TO_USER_ID: Record<string, string> = {
  member: "oidc-user",
  admin: "oidc-admin",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;

  const subject = params.get("subject") ?? "";
  const userId = SUBJECT_TO_USER_ID[subject];
  const user = userId ? findMockIdpUser(userId) : undefined;
  const redirectUri = params.get("redirect_uri");
  const clientId = params.get("client_id");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method") ?? "S256";
  const state = params.get("state");

  if (!user || !redirectUri || !clientId || !codeChallenge) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const code = randomToken();
  authorizationCodes.set(code, {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    redirectUri,
    clientId,
    codeChallenge,
    codeChallengeMethod,
    expiresAt: Date.now() + 60_000,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  return NextResponse.redirect(redirectUrl, { status: 302 });
}

import { NextResponse } from "next/server";

/** Escapes text for safe interpolation into the mock IdP's HTML response. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;

  if (params.get("client_id") !== process.env.OIDC_CLIENT_ID) {
    return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  }
  if (!params.get("redirect_uri") || !params.get("code_challenge")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const confirmBase = "/api/mock-idp/confirm?" + params.toString();
  const memberHref = escapeHtml(`${confirmBase}&subject=member`);
  const adminHref = escapeHtml(`${confirmBase}&subject=admin`);

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Mock IdP sign-in</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 420px; margin: 80px auto; text-align: center;">
  <h1 style="font-size: 18px;">Mock IdP — Local dev/test fixture</h1>
  <p style="color: #64748b; font-size: 14px;">Choose which test identity to sign in as.</p>
  <p style="margin-top: 24px;">
    <a data-testid="mock-idp-member" href="${memberHref}"
       style="display:inline-block;padding:10px 18px;background:#0E2338;color:#fff;border-radius:8px;text-decoration:none;margin:6px;">
      Continue as SSO Member
    </a>
  </p>
  <p>
    <a data-testid="mock-idp-admin" href="${adminHref}"
       style="display:inline-block;padding:10px 18px;background:#2E8FA3;color:#fff;border-radius:8px;text-decoration:none;margin:6px;">
      Continue as SSO Admin
    </a>
  </p>
</body>
</html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

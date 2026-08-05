import { NextResponse } from "next/server";
import { oidcLogoutUrl, safePostLogoutUrl } from "@/auth";

export async function GET(request: Request): Promise<Response> {
  const callbackUrl = new URL(request.url).searchParams.get("callbackUrl");
  const safeCallback = safePostLogoutUrl(callbackUrl);
  const providerLogout = await oidcLogoutUrl(safeCallback);

  return NextResponse.redirect(providerLogout ?? safeCallback);
}

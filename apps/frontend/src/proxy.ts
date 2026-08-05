import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";

const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/audit", "/approvals"];

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected || req.auth) {
    return NextResponse.next();
  }

  // Any leftover session-token cookie (valid or expired/invalid) means the
  // user had a session that no longer resolves — show the session-expired
  // banner rather than a plain "please sign in" first-visit redirect.
  const hadSessionCookie = req.cookies.getAll().some((c) => c.name.includes("session-token"));

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname + search);
  if (hadSessionCookie) {
    loginUrl.searchParams.set("error", "SessionExpired");
  }
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/audit/:path*", "/approvals/:path*"],
};

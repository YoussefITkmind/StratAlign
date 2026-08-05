import { NextResponse } from "next/server";
import { auth, signIn } from "@/lib/auth/auth";
import { GENERIC_OIDC_PROVIDER_ID } from "@/auth";
import {
  createOidcStepUpState,
  OIDC_STEP_UP_COOKIE,
} from "../../../../lib/auth/oidc-step-up-state";

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) return new NextResponse("Unable to re-authenticate", { status: 500 });

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.set({
    name: OIDC_STEP_UP_COOKIE,
    value: createOidcStepUpState(session.user.id, secret),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 5 * 60,
  });

  await signIn(
    GENERIC_OIDC_PROVIDER_ID,
    { redirectTo: "/admin?stepUp=complete" },
    { prompt: "login", max_age: "0" },
  );
  return NextResponse.redirect(new URL("/admin", request.url));
}

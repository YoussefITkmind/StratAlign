import { auth, handlers } from "@/auth";
import type { NextRequest } from "next/server";

export const { GET } = handlers;

export async function POST(request: NextRequest): Promise<Response> {
  const isSignOut = new URL(request.url).pathname.endsWith("/signout");
  const session = isSignOut ? await auth() : null;
  const response = await handlers.POST(request);

  if (
    !isSignOut ||
    (session as { authenticationMethod?: string } | null)
      ?.authenticationMethod !== "oidc" ||
    !response.headers.get("content-type")?.includes("application/json")
  ) {
    return response;
  }

  const body = await response.clone().json() as { url?: unknown };
  if (typeof body.url !== "string") return response;

  const logout = new URL("/api/auth/oidc-logout", request.url);
  logout.searchParams.set("callbackUrl", body.url);
  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return Response.json(
    { ...body, url: logout.toString() },
    { status: response.status, headers },
  );
}

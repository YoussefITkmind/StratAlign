import { NextResponse } from "next/server";
import { accessTokens } from "@/lib/mock-idp/store";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const record = token ? accessTokens.get(token) : undefined;

  if (!record || record.expiresAt < Date.now()) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  return NextResponse.json({
    sub: record.sub,
    email: record.email,
    name: record.name,
    role: record.role,
  });
}

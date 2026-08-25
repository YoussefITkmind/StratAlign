import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { TRPCError } from "@trpc/server";
import type { AppRouter } from "@spm/api/root";

export function createBackendIntegrationsClient(cookieHeader: string | null) {
  return createTRPCProxyClient<AppRouter>({
    links: [httpBatchLink({
      url: process.env.NEXT_PUBLIC_TRPC_URL ?? "http://localhost:4000/trpc",
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    })],
  });
}

const PASSTHROUGH_CODES = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "SERVICE_UNAVAILABLE",
  "TIMEOUT",
  "UNPROCESSABLE_CONTENT",
]);

export function translateBackendIntegrationsError(error: unknown): never {
  if (error instanceof TRPCClientError) {
    const code = (error.data as { code?: string } | undefined)?.code;
    throw new TRPCError({
      code: (code && PASSTHROUGH_CODES.has(code)
        ? code
        : "BAD_REQUEST") as ConstructorParameters<typeof TRPCError>[0]["code"],
      message: error.message,
    });
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unable to complete Data & Integrations request",
  });
}

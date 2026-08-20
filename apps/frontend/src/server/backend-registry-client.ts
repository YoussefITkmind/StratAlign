import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { TRPCError } from "@trpc/server";
import type { AppRouter } from "@spm/api/root";

export function createBackendRegistryClient(cookieHeader: string | null) {
  return createTRPCProxyClient<AppRouter>({
    links: [httpBatchLink({
      url: process.env.NEXT_PUBLIC_TRPC_URL ?? "http://localhost:4000/trpc",
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    })],
  });
}

/**
 * Codes forwarded unchanged from the backend.
 *
 * Anything outside this set collapses to BAD_REQUEST, so an unexpected backend
 * failure cannot present itself to the browser as something more specific than
 * it is. `SERVICE_UNAVAILABLE`, `TIMEOUT`, and `UNPROCESSABLE_CONTENT` are here
 * because the AI surface distinguishes "provider is down", "provider was slow",
 * and "provider answered with nonsense" — and the UI shows a different recovery
 * for each.
 */
const PASSTHROUGH_CODES = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "SERVICE_UNAVAILABLE",
  "TIMEOUT",
  "UNPROCESSABLE_CONTENT",
  "TOO_MANY_REQUESTS",
]);

export function translateBackendRegistryError(error: unknown): never {
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
    message: "Unable to complete Registry request",
  });
}

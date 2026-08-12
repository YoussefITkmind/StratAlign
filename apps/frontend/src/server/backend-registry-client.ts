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

export function translateBackendRegistryError(error: unknown): never {
  if (error instanceof TRPCClientError) {
    const code = (error.data as { code?: string } | undefined)?.code;
    throw new TRPCError({
      code: code === "UNAUTHORIZED" ? "UNAUTHORIZED" :
        code === "FORBIDDEN" ? "FORBIDDEN" :
          code === "NOT_FOUND" ? "NOT_FOUND" :
            code === "CONFLICT" ? "CONFLICT" : "BAD_REQUEST",
      message: error.message,
    });
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unable to complete Registry request",
  });
}

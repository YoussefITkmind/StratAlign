import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { TRPCError } from "@trpc/server";
import type { AppRouter } from "@spm/api";

export function createBackendAuthClient() {
  return createTRPCProxyClient<AppRouter>({
    links: [httpBatchLink({
      url: process.env.NEXT_PUBLIC_TRPC_URL ?? "http://localhost:4000/trpc",
    })],
  });
}

export function translateBackendAuthError(error: unknown): never {
  if (error instanceof TRPCClientError) {
    const data = error.data as { code?: string } | undefined;
    throw new TRPCError({
      code: data?.code === "CONFLICT" ? "CONFLICT" :
        data?.code === "TOO_MANY_REQUESTS" ? "TOO_MANY_REQUESTS" : "BAD_REQUEST",
      message: error.message,
    });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to create account" });
}

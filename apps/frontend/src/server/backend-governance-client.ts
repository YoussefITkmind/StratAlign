import {
  createTRPCProxyClient,
  httpBatchLink,
  TRPCClientError,
} from "@trpc/client";

import {
  TRPCError,
} from "@trpc/server";

import type {
  AppRouter,
} from "@spm/api";

export function createBackendGovernanceClient(
  cookieHeader: string | null,
) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url:
          process.env.NEXT_PUBLIC_TRPC_URL ??
          "http://localhost:4000/trpc",

        headers:
          cookieHeader
            ? {
                cookie:
                  cookieHeader,
              }
            : {},
      }),
    ],
  });
}

export function translateBackendGovernanceError(
  error: unknown,
): never {
  if (
    error instanceof
    TRPCClientError
  ) {
    const data =
      error.data as {
        code?: string;
      } | undefined;

    const code =
      data?.code;

    throw new TRPCError({
      code:
        code === "UNAUTHORIZED"
          ? "UNAUTHORIZED"
          : code === "FORBIDDEN"
            ? "FORBIDDEN"
            : code === "NOT_FOUND"
              ? "NOT_FOUND"
              : code === "CONFLICT"
                ? "CONFLICT"
                : code === "BAD_REQUEST"
                  ? "BAD_REQUEST"
                  : "INTERNAL_SERVER_ERROR",

      message:
        error.message,
    });
  }

  throw new TRPCError({
    code:
      "INTERNAL_SERVER_ERROR",

    message:
      "Unable to complete governance request",
  });
}

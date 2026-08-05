import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { TRPCError } from "@trpc/server";
import type { AppRouter } from "@spm/api";
import { StepUpRequiredError, stepUpActionClassSchema } from "@spm/domain-iam";

export function createBackendIamClient(cookieHeader: string | null) {
  return createTRPCProxyClient<AppRouter>({
    links: [httpBatchLink({
      url: process.env.NEXT_PUBLIC_TRPC_URL ?? "http://localhost:4000/trpc",
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    })],
  });
}

export function translateBackendIamError(error: unknown): never {
  if (error instanceof TRPCClientError) {
    const data = error.data as {
      code?: string;
      stepUpRequired?: boolean;
      actionClass?: unknown;
    } | undefined;
    const actionClass = stepUpActionClassSchema.safeParse(data?.actionClass);
    throw new TRPCError({
      code: data?.code === "UNAUTHORIZED" ? "UNAUTHORIZED" :
        data?.code === "FORBIDDEN" ? "FORBIDDEN" : "BAD_REQUEST",
      message: error.message,
      cause: data?.stepUpRequired && actionClass.success
        ? new StepUpRequiredError(actionClass.data)
        : undefined,
    });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to complete IAM request" });
}

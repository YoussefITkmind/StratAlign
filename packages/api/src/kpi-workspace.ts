import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./index";

interface WorkspaceService {
  list(): Promise<unknown>;
}

function service(ctx: unknown): WorkspaceService {
  const value = (ctx as { kpiOkrWorkspace?: unknown }).kpiOkrWorkspace;
  if (!value) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "KPI and OKR workspace service unavailable",
    });
  }
  return value as WorkspaceService;
}

export const kpiWorkspaceRouter = router({
  list: protectedProcedure.query(({ ctx }) => service(ctx).list()),
});

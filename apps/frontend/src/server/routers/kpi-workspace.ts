import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";

const backend = (ctx: { cookieHeader: string | null }) => createBackendRegistryClient(ctx.cookieHeader);

export const kpiWorkspaceRouter = router({
  list: authenticatedProcedure.query(async ({ ctx }) => {
    try {
      return await backend(ctx).kpiWorkspace.list.query();
    } catch (error) {
      return translateBackendRegistryError(error);
    }
  }),
});

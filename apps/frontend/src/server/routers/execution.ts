import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";

const id = z.string().uuid();
const backend = (ctx: { cookieHeader: string | null }) => createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

export const executionRouter = router({
  initiative: router({
    list: authenticatedProcedure
      .input(z.object({
        status: z.enum(["on_track", "at_risk", "off_track"]).optional(),
        scope: z.enum(["all", "mine"]),
      }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).execution.initiative.list.query(input))),
    register: authenticatedProcedure.input(z.object({
      nameEn: z.string().trim().min(1).max(300),
      nameAr: z.string().trim().min(1).max(300),
      strategicPlayNodeId: id,
      ownerUserId: id,
      stage: z.enum(["design", "pilot", "execute", "scale", "done"]),
    }).strict()).mutation(({ ctx, input }) => forward(() => backend(ctx).execution.initiative.register.mutate(input))),
  }),
});

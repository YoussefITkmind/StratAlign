import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";

const id = z.string().uuid();
const backend = (ctx: { cookieHeader: string | null }) => createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

const stage = z.enum(["design", "pilot", "execute", "scale", "done"]);
const status = z.enum(["on_track", "at_risk", "off_track"]);
const confidence = z.enum(["high", "medium", "low"]);

export const executionRouter = router({
  initiative: router({
    list: authenticatedProcedure
      .input(z.object({
        status: status.optional(),
        scope: z.enum(["all", "mine"]),
      }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).execution.initiative.list.query(input))),
    register: authenticatedProcedure.input(z.object({
      nameEn: z.string().trim().min(1).max(300),
      nameAr: z.string().trim().min(1).max(300),
      strategicPlayNodeId: id,
      ownerUserId: id,
      stage,
    }).strict()).mutation(({ ctx, input }) => forward(() => backend(ctx).execution.initiative.register.mutate(input))),
    linkJira: authenticatedProcedure.input(z.object({
      initiativeId: id,
      jiraProjectKey: z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
      jiraProjectUrl: z.string().url().max(2048),
    }).strict()).mutation(({ ctx, input }) => forward(() => backend(ctx).execution.initiative.linkJira.mutate(input))),
  }),
  status: router({
    update: authenticatedProcedure.input(z.object({
      initiativeId: id,
      period: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      stage,
      status,
      confidence,
      narrativeEn: z.string().trim().max(4000).nullable().optional(),
      narrativeAr: z.string().trim().max(4000).nullable().optional(),
    }).strict()).mutation(({ ctx, input }) => forward(() => backend(ctx).execution.status.update.mutate(input))),
    history: authenticatedProcedure.input(z.object({ initiativeId: id }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).execution.status.history.query(input))),
  }),
});

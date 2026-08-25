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
const priority = z.enum(["critical", "high", "medium", "low"]);
const optionalUrl = z.string().trim().url().max(2048).nullable().optional();

export const executionRouter = router({
  initiative: router({
    list: authenticatedProcedure
      .input(z.object({
        status: status.optional(),
        scope: z.enum(["all", "mine", "my_plays"]),
      }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).execution.initiative.list.query(input))),
    get: authenticatedProcedure.input(z.object({ initiativeId: id }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).execution.initiative.get.query(input))),
    register: authenticatedProcedure.input(z.object({
      nameEn: z.string().trim().min(1).max(300),
      nameAr: z.string().trim().min(1).max(300),
      strategicPlayNodeId: id,
      ownerUserId: id,
      stage,
      priority: priority.optional(),
      department: z.string().trim().max(200).nullable().optional(),
      startDate: z.coerce.date().nullable().optional(),
      endDate: z.coerce.date().nullable().optional(),
      tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
      budgetAmount: z.coerce.number().nonnegative().max(1_000_000_000_000).nullable().optional(),
      currency: z.string().trim().length(3).optional(),
    }).strict()).mutation(({ ctx, input }) => forward(() => backend(ctx).execution.initiative.register.mutate(input))),
    linkJira: authenticatedProcedure.input(z.object({
      initiativeId: id,
      jiraProjectKey: z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
      jiraProjectUrl: z.string().url().max(2048),
    }).strict()).mutation(({ ctx, input }) => forward(() => backend(ctx).execution.initiative.linkJira.mutate(input))),
  }),
  project: router({
    list: authenticatedProcedure
      .input(z.object({ parentInitiativeId: id.optional() }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).execution.project.list.query(input))),
    create: authenticatedProcedure.input(z.object({
      name: z.string().trim().min(1).max(300),
      description: z.string().trim().max(4000).nullable().optional(),
      department: z.string().trim().max(200).nullable().optional(),
      ownerUserId: id,
      parentInitiativeId: id.nullable().optional(),
      startDate: z.coerce.date().nullable().optional(),
      endDate: z.coerce.date().nullable().optional(),
      budgetAmount: z.coerce.number().nonnegative().max(1_000_000_000_000).nullable().optional(),
      priority: priority.optional(),
      jiraBoardUrl: optionalUrl,
      confluenceSpaceUrl: optionalUrl,
    }).strict()).mutation(({ ctx, input }) => forward(() => backend(ctx).execution.project.create.mutate(input))),
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

import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";

const id = z.string().uuid();
const backend = (ctx: { cookieHeader: string | null }) => createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

const nodeType = z.enum(["plan", "perspective", "objective", "initiative", "project"]);
const nodeStatus = z.enum(["on-track", "at-risk", "off-track", "not-started"]);
const linkedKpis = z.array(z.string().trim().min(1).max(80)).max(20);

// Deterministic placeholder copy per node type — stands in until this is
// wired to a real model, so callers get type-appropriate text either way.
const DRAFT_TEMPLATES: Record<z.infer<typeof nodeType>, (name: string) => string> = {
  plan: (name) => `The "${name}" plan sets the overall direction and priorities the organization will pursue.`,
  perspective: (name) => `The "${name}" perspective groups related objectives that share a common strategic lens.`,
  objective: (name) => `To achieve the strategic objective of "${name}", we will focus on key measurable outcomes that align with our overall corporate strategy.`,
  initiative: (name) => `This initiative, "${name}", is designed to implement actionable steps toward our broader goals, requiring cross-functional collaboration.`,
  project: (name) => `The "${name}" project delivers a defined scope of work in support of its parent initiative.`,
};

export const strategyHierarchyRouter = router({
  tree: authenticatedProcedure.query(({ ctx }) => forward(() => backend(ctx).strategyHierarchy.tree.query())),

  draftDescription: authenticatedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(200),
        type: nodeType,
        parentName: z.string().trim().max(200).optional(),
      }).strict(),
    )
    .mutation(({ input }) => {
      let draft = DRAFT_TEMPLATES[input.type](input.name);
      if (input.parentName) {
        draft += ` This directly supports the parent goal of "${input.parentName}".`;
      }
      return { draft };
    }),

  createNode: authenticatedProcedure
    .input(
      z.object({
        parentId: id.nullable(),
        name: z.string().trim().min(1).max(200),
        type: nodeType,
        status: nodeStatus,
        progress: z.number().int().min(0).max(100),
        ownerName: z.string().trim().min(1).max(120),
        budget: z.string().trim().max(50).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        description: z.string().trim().max(2000).optional(),
        linkedKpis: linkedKpis.optional(),
      }).strict(),
    )
    .mutation(({ ctx, input }) => forward(() => backend(ctx).strategyHierarchy.create.mutate(input))),

  updateNode: authenticatedProcedure
    .input(
      z.object({
        id,
        name: z.string().trim().min(1).max(200).optional(),
        type: nodeType.optional(),
        status: nodeStatus.optional(),
        progress: z.number().int().min(0).max(100).optional(),
        ownerName: z.string().trim().min(1).max(120).optional(),
        budget: z.string().trim().max(50).nullable().optional(),
        startDate: z.coerce.date().nullable().optional(),
        endDate: z.coerce.date().nullable().optional(),
        description: z.string().trim().max(2000).nullable().optional(),
        linkedKpis: linkedKpis.optional(),
      }).strict(),
    )
    .mutation(({ ctx, input }) => forward(() => backend(ctx).strategyHierarchy.update.mutate(input))),

  deleteNode: authenticatedProcedure
    .input(z.object({ id }).strict())
    .mutation(({ ctx, input }) => forward(() => backend(ctx).strategyHierarchy.delete.mutate(input))),

  backfillBridge: authenticatedProcedure
    .mutation(({ ctx }) => forward(() => backend(ctx).strategyHierarchy.backfillBridge.mutate())),
});

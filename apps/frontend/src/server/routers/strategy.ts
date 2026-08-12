import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";

const id = z.string().uuid();
const backend = (ctx: { cookieHeader: string | null }) => createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

export const strategyRouter = router({
  nodes: authenticatedProcedure.query(({ ctx }) => forward(() => backend(ctx).strategy.node.list.query())),
  node: authenticatedProcedure.input(z.object({ nodeId: id }).strict())
    .query(({ ctx, input }) => forward(() => backend(ctx).strategy.node.get.query(input))),
  trace: authenticatedProcedure.input(z.object({ nodeId: id }).strict())
    .query(({ ctx, input }) => forward(() => backend(ctx).strategy.node.trace.query(input))),
  plans: authenticatedProcedure.query(({ ctx }) => forward(() => backend(ctx).strategy.planVersion.list.query())),
  edges: authenticatedProcedure.input(z.object({ planVersionId: id }).strict())
    .query(({ ctx, input }) => forward(() => backend(ctx).strategy.edge.list.query(input))),
  stagedChanges: authenticatedProcedure.input(z.object({ planVersionId: id }).strict())
    .query(({ ctx, input }) => forward(() => backend(ctx).strategy.stagedChange.list.query(input))),
  createNode: authenticatedProcedure.input(z.object({
    type: z.enum(["corporate_strategy", "theme", "objective", "strategic_play", "portfolio", "area_of_focus"]),
    nameEn: z.string().trim().min(1).max(300), nameAr: z.string().trim().min(1).max(300),
    planVersionId: id, approvalCaseId: id.optional(), stagedChangeId: id.optional(),
  }).strict()).mutation(({ ctx, input }) => forward(() => backend(ctx).strategy.node.create.mutate(input))),
  linkEdge: authenticatedProcedure.input(z.object({
    fromNodeId: id, toNodeId: id,
    edgeType: z.enum(["contains", "executed_by", "belongs_to_portfolio", "aligns_to"]),
    planVersionId: id, approvalCaseId: id.optional(), stagedChangeId: id.optional(),
  }).strict()).mutation(({ ctx, input }) => forward(() => backend(ctx).strategy.edge.link.mutate(input))),
  openPlan: authenticatedProcedure.input(z.object({ planVersionId: id }).strict())
    .mutation(({ ctx, input }) => forward(() => backend(ctx).strategy.planVersion.open.mutate(input))),
});

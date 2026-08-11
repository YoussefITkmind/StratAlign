import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type {
  OwnerAssignment,
  PlanVersion,
  StrategyEdge,
  StrategyNode,
} from "@spm/domain-strategy";
import { requireRole, router } from "./index";

export interface StagedChangeOutput {
  id: string;
  approvalCaseId: string;
  planVersionId: string;
  kind: "node_create" | "node_update" | "node_retire" | "edge_link" | "edge_unlink";
  targetId: string | null;
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "cancelled";
  requestedBy: string;
  requestedAt: Date;
  appliedAt: Date | null;
}

export interface StrategyServiceContract {
  createPlanVersion(name: string): Promise<PlanVersion>;

  createNode(input: {
    type: "corporate_strategy" | "theme" | "objective" | "strategic_play" | "portfolio" | "area_of_focus";
    nameEn: string;
    nameAr: string;
    planVersionId: string;
    actorUserId: string;
    approvalCaseId?: string;
  }): Promise<StrategyNode | StagedChangeOutput>;

  updateNode(input: {
    nodeId: string;
    nameEn?: string;
    nameAr?: string;
    actorUserId: string;
    approvalCaseId?: string;
  }): Promise<StrategyNode | StagedChangeOutput>;

  retireNode(input: {
    nodeId: string;
    actorUserId: string;
    approvalCaseId?: string;
  }): Promise<StrategyNode | StagedChangeOutput>;

  linkEdge(input: {
    fromNodeId: string;
    toNodeId: string;
    edgeType: "contains" | "executed_by" | "belongs_to_portfolio" | "aligns_to";
    planVersionId: string;
    actorUserId: string;
    approvalCaseId?: string;
  }): Promise<StrategyEdge | StagedChangeOutput>;

  unlinkEdge(input: {
    edgeId: string;
    actorUserId: string;
    approvalCaseId?: string;
  }): Promise<{ unlinked: true } | StagedChangeOutput>;

  assignOwner(input: {
    nodeId: string;
    ownerUserId: string;
    assignedBy: string;
  }): Promise<OwnerAssignment>;

  openPlanVersion(planVersionId: string, opensAt?: Date): Promise<PlanVersion>;
  closePlanVersion(planVersionId: string, closesAt?: Date): Promise<PlanVersion>;

  carryForward(
    sourcePlanVersionId: string,
    newName: string,
    actorUserId: string,
  ): Promise<PlanVersion>;
}

declare module "./index" {
  interface TrpcContext { strategy?: StrategyServiceContract; }
}

const id = z.string().uuid();
const admin = () => requireRole("seo_administrator");
const fail = (error: unknown): never => {
  throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Strategy operation failed" });
};
const service = (ctx: { strategy?: StrategyServiceContract }): StrategyServiceContract => {
  if (!ctx.strategy) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Strategy service unavailable" });
  }
  return ctx.strategy;
};

export const strategyRouter = router({
  node: router({
    create: admin().input(z.object({
      type: z.enum(["corporate_strategy","theme","objective","strategic_play","portfolio","area_of_focus"]),
      nameEn: z.string().trim().min(1).max(300), nameAr: z.string().trim().min(1).max(300), planVersionId: id,
      approvalCaseId: id.optional(),
    }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).createNode({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); }
    }),
    update: admin().input(z.object({ nodeId: id, nameEn: z.string().trim().min(1).max(300).optional(), nameAr: z.string().trim().min(1).max(300).optional(), approvalCaseId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).updateNode({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
    retire: admin().input(z.object({ nodeId: id, approvalCaseId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).retireNode({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
  }),
  edge: router({
    link: admin().input(z.object({ fromNodeId: id, toNodeId: id, edgeType: z.enum(["contains","executed_by","belongs_to_portfolio","aligns_to"]), planVersionId: id, approvalCaseId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).linkEdge({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
    unlink: admin().input(z.object({ edgeId: id, approvalCaseId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).unlinkEdge({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
  }),
  owner: router({
    assign: admin().input(z.object({ nodeId: id, ownerUserId: z.string().min(1) }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).assignOwner({ ...input, assignedBy: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
  }),
  planVersion: router({
    create: admin().input(z.object({ name: z.string().trim().min(1).max(300) }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).createPlanVersion(input.name); } catch (e) { return fail(e); } }),
    open: admin().input(z.object({ planVersionId: id, opensAt: z.coerce.date().optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).openPlanVersion(input.planVersionId, input.opensAt); } catch (e) { return fail(e); } }),
    close: admin().input(z.object({ planVersionId: id, closesAt: z.coerce.date().optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).closePlanVersion(input.planVersionId, input.closesAt); } catch (e) { return fail(e); } }),
    carryForward: admin().input(z.object({ sourcePlanVersionId: id, name: z.string().trim().min(1).max(300) }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).carryForward(input.sourcePlanVersionId, input.name, ctx.session!.user.id); } catch (e) { return fail(e); } }),
  }),
});

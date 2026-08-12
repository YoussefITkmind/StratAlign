import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type {
  OwnerAssignment,
  PlanVersion,
  StrategyEdge,
  StrategyEdgeType,
  StrategyNode,
  StrategyNodeState,
  StrategyNodeType,
} from "@spm/domain-strategy";
import type { PortfolioServiceContract } from "./portfolio";
import { protectedProcedure, requireRole, router } from "./index";

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
  listNodes(): Promise<StrategyNode[]>;
  getNode(nodeId: string): Promise<StrategyNode | null>;
  listPlanVersions(): Promise<PlanVersion[]>;
  getEdges(planVersionId: string): Promise<StrategyEdge[]>;
  listStagedChanges(planVersionId: string): Promise<StagedChangeOutput[]>;
  createPlanVersion(name: string): Promise<PlanVersion>;

  createNode(input: {
    type: "corporate_strategy" | "theme" | "objective" | "strategic_play" | "portfolio" | "area_of_focus";
    nameEn: string;
    nameAr: string;
    planVersionId: string;
    actorUserId: string;
    approvalCaseId?: string;
    stagedChangeId?: string;
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
    stagedChangeId?: string;
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

export interface StrategyTraversalNodeOutput {
  id: string;
  type: StrategyNodeType;
  nameEn: string;
  nameAr: string;
  planVersionId: string;
  state: StrategyNodeState;
  depth: number;
  edgeType: StrategyEdgeType | null;
}

export interface StrategyFullTraceOutput {
  nodeId: string;
  ancestry: StrategyTraversalNodeOutput[];
  cascade: StrategyTraversalNodeOutput[];
}

export interface StrategyTraversalServiceContract {
  getCascade(
    nodeId: string,
    maxDepth?: number,
  ): Promise<StrategyTraversalNodeOutput[]>;

  getAncestry(
    nodeId: string,
  ): Promise<StrategyTraversalNodeOutput[]>;

  getFullTrace(
    nodeId: string,
  ): Promise<StrategyFullTraceOutput>;
}

declare module "./index" {
  interface TrpcContext {
    strategy?: StrategyServiceContract;
    strategyTraversal?: StrategyTraversalServiceContract;
  }
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

const traversal = (
  ctx: { strategyTraversal?: StrategyTraversalServiceContract },
): StrategyTraversalServiceContract => {
  if (!ctx.strategyTraversal) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Strategy traversal service unavailable",
    });
  }
  return ctx.strategyTraversal;
};

const portfolio = (ctx: { portfolio?: PortfolioServiceContract }): PortfolioServiceContract => {
  if (!ctx.portfolio) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Portfolio service unavailable",
    });
  }
  return ctx.portfolio;
};

export const strategyRouter = router({
  node: router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        try { return await service(ctx).listNodes(); } catch (e) { return fail(e); }
      }),
    get: protectedProcedure.input(z.object({ nodeId: id }).strict())
      .query(async ({ ctx, input }) => {
        try { return await service(ctx).getNode(input.nodeId); } catch (e) { return fail(e); }
      }),
    cascade: protectedProcedure
      .input(
        z.object({
          nodeId: id,
          maxDepth: z.number().int().min(1).max(8).default(8),
        }).strict(),
      )
      .query(async ({ ctx, input }) => {
        try {
          return await traversal(ctx).getCascade(input.nodeId, input.maxDepth);
        } catch (e) {
          return fail(e);
        }
      }),

    ancestry: protectedProcedure
      .input(z.object({ nodeId: id }).strict())
      .query(async ({ ctx, input }) => {
        try {
          return await traversal(ctx).getAncestry(input.nodeId);
        } catch (e) {
          return fail(e);
        }
      }),

    trace: protectedProcedure
      .input(z.object({ nodeId: id }).strict())
      .query(async ({ ctx, input }) => {
        try {
          return await traversal(ctx).getFullTrace(input.nodeId);
        } catch (e) {
          return fail(e);
        }
      }),
    create: admin().input(z.object({
      type: z.enum(["corporate_strategy","theme","objective","strategic_play","portfolio","area_of_focus"]),
      nameEn: z.string().trim().min(1).max(300), nameAr: z.string().trim().min(1).max(300), planVersionId: id,
      approvalCaseId: id.optional(),
      stagedChangeId: id.optional(),
    }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).createNode({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); }
    }),
    update: admin().input(z.object({ nodeId: id, nameEn: z.string().trim().min(1).max(300).optional(), nameAr: z.string().trim().min(1).max(300).optional(), approvalCaseId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).updateNode({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
    retire: admin().input(z.object({ nodeId: id, approvalCaseId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).retireNode({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
  }),
  edge: router({
    list: protectedProcedure.input(z.object({ planVersionId: id }).strict())
      .query(async ({ ctx, input }) => {
        try { return await service(ctx).getEdges(input.planVersionId); } catch (e) { return fail(e); }
      }),
    link: admin().input(z.object({ fromNodeId: id, toNodeId: id, edgeType: z.enum(["contains","executed_by","belongs_to_portfolio","aligns_to"]), planVersionId: id, approvalCaseId: id.optional(), stagedChangeId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).linkEdge({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
    unlink: admin().input(z.object({ edgeId: id, approvalCaseId: id.optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).unlinkEdge({ ...input, actorUserId: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
  }),
  owner: router({
    assign: admin().input(z.object({ nodeId: id, ownerUserId: z.string().min(1) }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).assignOwner({ ...input, assignedBy: ctx.session!.user.id }); } catch (e) { return fail(e); } }),
  }),
  planVersion: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try { return await service(ctx).listPlanVersions(); } catch (e) { return fail(e); }
    }),
    create: admin().input(z.object({ name: z.string().trim().min(1).max(300) }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).createPlanVersion(input.name); } catch (e) { return fail(e); } }),
    open: admin().input(z.object({ planVersionId: id, opensAt: z.coerce.date().optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).openPlanVersion(input.planVersionId, input.opensAt); } catch (e) { return fail(e); } }),
    close: admin().input(z.object({ planVersionId: id, closesAt: z.coerce.date().optional() }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).closePlanVersion(input.planVersionId, input.closesAt); } catch (e) { return fail(e); } }),
    carryForward: admin().input(z.object({ sourcePlanVersionId: id, name: z.string().trim().min(1).max(300) }).strict())
      .mutation(async ({ ctx, input }) => { try { return await service(ctx).carryForward(input.sourcePlanVersionId, input.name, ctx.session!.user.id); } catch (e) { return fail(e); } }),
  }),
  portfolio: router({
    findUnmappedPlays: admin().query(async ({ ctx }) => {
      try { return await portfolio(ctx).findUnmappedPlays(); } catch (e) { return fail(e); }
    }),
  }),
  stagedChange: router({
    list: protectedProcedure.input(z.object({ planVersionId: id }).strict())
      .query(async ({ ctx, input }) => {
        try { return await service(ctx).listStagedChanges(input.planVersionId); } catch (e) { return fail(e); }
      }),
  }),
});
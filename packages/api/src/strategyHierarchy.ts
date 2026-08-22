import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, requireRole, router } from "./index";

export type NodeType = "plan" | "perspective" | "objective" | "initiative" | "project";
export type NodeStatus = "on-track" | "at-risk" | "off-track" | "not-started";

export interface StrategyHierarchyOwnerOutput {
  name: string;
  initials: string;
  color: string;
}

export interface StrategyHierarchyActivityOutput {
  id: string;
  message: string;
  actor: string;
  createdAt: Date;
}

export interface StrategyHierarchyNodeOutput {
  id: string;
  parentId: string | null;
  name: string;
  type: NodeType;
  status: NodeStatus;
  progress: number;
  owner: StrategyHierarchyOwnerOutput;
  budget: string | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
  linkedKpis: string[];
  createdAt: Date;
  activity: StrategyHierarchyActivityOutput[];
  children: StrategyHierarchyNodeOutput[];
}

export interface StrategyHierarchyServiceContract {
  getTree(): Promise<StrategyHierarchyNodeOutput | null>;

  createNode(input: {
    parentId: string | null;
    name: string;
    type: NodeType;
    status: NodeStatus;
    progress: number;
    ownerName: string;
    budget?: string;
    startDate?: Date;
    endDate?: Date;
    description?: string;
    linkedKpis?: string[];
    actorUserId: string;
    actorName: string;
  }): Promise<StrategyHierarchyNodeOutput>;

  updateNode(input: {
    id: string;
    patch: {
      name?: string;
      type?: NodeType;
      status?: NodeStatus;
      progress?: number;
      ownerName?: string;
      budget?: string | null;
      startDate?: Date | null;
      endDate?: Date | null;
      description?: string | null;
      linkedKpis?: string[];
    };
    actorUserId: string;
    actorName: string;
  }): Promise<StrategyHierarchyNodeOutput>;

  deleteNode(input: { id: string; actorUserId: string; actorName: string }): Promise<{ deleted: true }>;
}

declare module "./index" {
  interface TrpcContext {
    strategyHierarchy?: StrategyHierarchyServiceContract;
  }
}

const id = z.string().uuid();
const admin = () => requireRole("seo_administrator");
const fail = (error: unknown): never => {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : "Strategy hierarchy operation failed",
  });
};
const service = (ctx: { strategyHierarchy?: StrategyHierarchyServiceContract }): StrategyHierarchyServiceContract => {
  if (!ctx.strategyHierarchy) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Strategy hierarchy service unavailable" });
  }
  return ctx.strategyHierarchy;
};

const nodeType = z.enum(["plan", "perspective", "objective", "initiative", "project"]);
const nodeStatus = z.enum(["on-track", "at-risk", "off-track", "not-started"]);
const linkedKpis = z.array(z.string().trim().min(1).max(80)).max(20);

export const strategyHierarchyRouter = router({
  tree: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await service(ctx).getTree();
    } catch (e) {
      return fail(e);
    }
  }),

  create: admin()
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
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).createNode({
          ...input,
          actorUserId: ctx.session!.user.id,
          actorName: ctx.session!.user.name ?? ctx.session!.user.email ?? "Unknown",
        });
      } catch (e) {
        return fail(e);
      }
    }),

  update: admin()
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
    .mutation(async ({ ctx, input }) => {
      const { id: nodeId, ...patch } = input;
      try {
        return await service(ctx).updateNode({
          id: nodeId,
          patch,
          actorUserId: ctx.session!.user.id,
          actorName: ctx.session!.user.name ?? ctx.session!.user.email ?? "Unknown",
        });
      } catch (e) {
        return fail(e);
      }
    }),

  delete: admin()
    .input(z.object({ id }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).deleteNode({
          id: input.id,
          actorUserId: ctx.session!.user.id,
          actorName: ctx.session!.user.name ?? ctx.session!.user.email ?? "Unknown",
        });
      } catch (e) {
        return fail(e);
      }
    }),
});

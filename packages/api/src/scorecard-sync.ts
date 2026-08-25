import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, requireRole, router } from "./index";

const id = z.string().uuid();
const scorecardStatus = z.enum(["on-track", "at-risk", "draft"]);
const objectiveStatus = z.enum(["on-track", "at-risk", "off-track", "not-started"]);

interface SyncService {
  createObjective(input: {
    scorecardId: string;
    perspectiveId: string;
    name: string;
    status: "on-track" | "at-risk" | "off-track" | "not-started";
    progress: number;
    ownerName: string;
    ownerInitials?: string;
    ownerColor?: string;
    description?: string | null;
    kpiSnapshotIds?: string[];
    actorUserId: string;
  }): Promise<unknown>;
  updateObjective(input: {
    scorecardId: string;
    perspectiveId: string;
    objectiveNodeId: string;
    name: string;
    status: "on-track" | "at-risk" | "off-track" | "not-started";
    progress: number;
    ownerName: string;
    ownerInitials?: string;
    ownerColor?: string;
    description?: string | null;
    kpiSnapshotIds?: string[];
  }): Promise<unknown>;
  deleteObjective(input: { scorecardId: string; objectiveNodeId: string }): Promise<{ removed: true }>;
  createKpi(input: {
    scorecardId: string;
    perspectiveId: string;
    name: string;
    status: "on-track" | "at-risk" | "draft";
    ownerInitials: string;
    ownerColor: string;
    score: number;
    priorScore?: number;
    weight?: number;
    actual?: string;
    target?: string;
    variance?: string;
    trend?: number[];
    objectiveNodeIds?: string[];
  }): Promise<unknown>;
  updateKpi(input: {
    scorecardId: string;
    perspectiveId: string;
    kpiSnapshotId: string;
    name: string;
    status: "on-track" | "at-risk" | "draft";
    ownerInitials: string;
    ownerColor: string;
    score: number;
    priorScore?: number;
    weight?: number;
    actual?: string;
    target?: string;
    variance?: string;
    trend?: number[];
    objectiveNodeIds?: string[];
  }): Promise<unknown>;
  deleteKpi(input: { scorecardId: string; kpiSnapshotId: string }): Promise<{ removed: true }>;
}

function service(ctx: unknown): SyncService {
  const value = (ctx as { balancedScorecard?: unknown }).balancedScorecard;
  if (!value) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Balanced scorecard service unavailable" });
  return value as SyncService;
}

function fail(error: unknown): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : "Scorecard synchronization failed",
  });
}

const author = () => requireRole("strategy_analyst", "seo_administrator");

const objectiveInput = z.object({
  scorecardId: id,
  perspectiveId: id,
  name: z.string().trim().min(1).max(300),
  status: objectiveStatus,
  progress: z.number().min(0).max(100),
  ownerName: z.string().trim().min(1).max(200),
  ownerInitials: z.string().trim().min(1).max(2).optional(),
  ownerColor: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  kpiSnapshotIds: z.array(id).max(100).optional(),
}).strict();

const kpiInput = z.object({
  scorecardId: id,
  perspectiveId: id,
  name: z.string().trim().min(1).max(300),
  status: scorecardStatus,
  ownerInitials: z.string().trim().min(1).max(2),
  ownerColor: z.string().trim().min(1).max(100),
  score: z.number().min(0).max(100),
  priorScore: z.number().min(0).max(100).optional(),
  weight: z.number().min(0).max(100).optional(),
  actual: z.string().max(100).optional(),
  target: z.string().max(100).optional(),
  variance: z.string().max(100).optional(),
  trend: z.array(z.number().finite()).max(60).optional(),
  objectiveNodeIds: z.array(id).max(100).optional(),
}).strict();

export const scorecardSyncRouter = router({
  objective: router({
    create: author().input(objectiveInput).mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).createObjective({ ...input, actorUserId: ctx.session!.user.id });
      } catch (error) { return fail(error); }
    }),
    update: author().input(objectiveInput.extend({ objectiveNodeId: id })).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).updateObjective(input); } catch (error) { return fail(error); }
    }),
    delete: author().input(z.object({ scorecardId: id, objectiveNodeId: id }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).deleteObjective(input); } catch (error) { return fail(error); }
    }),
  }),
  kpi: router({
    create: author().input(kpiInput).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).createKpi(input); } catch (error) { return fail(error); }
    }),
    update: author().input(kpiInput.extend({ kpiSnapshotId: id })).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).updateKpi(input); } catch (error) { return fail(error); }
    }),
    delete: author().input(z.object({ scorecardId: id, kpiSnapshotId: id }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).deleteKpi(input); } catch (error) { return fail(error); }
    }),
  }),
  health: protectedProcedure.query(() => ({ connected: true as const })),
});

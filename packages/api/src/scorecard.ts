import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, requireRole, router } from "./index";

export interface ScorecardPlacementDetail {
  perspectiveId: string;
  objectiveNodeId: string;
  objectiveNameEn: string;
  objectiveNameAr: string;
  perspective: { id: string; nameEn: string; nameAr: string };
  owners: Array<{ id: string; displayName: string | null; email: string }>;
  kpiDefinitionId: string | null;
  kpiNameEn: string | null;
  kpiCount: number;
  initiativeCount: number;
  status: "on_track" | "watch" | "off_track" | null;
  score: number | null;
  progress: number | null;
  trend: Array<{ period: string; score: number }>;
}
export interface ScorecardServiceContract {
  listScorecards(): Promise<unknown[]>;
  getScorecard(scorecardId: string): Promise<unknown>;
  createScorecard(input: {
    nameEn: string;
    nameAr: string;
    scopeNodeId?: string | null;
    planVersionId: string;
  }): Promise<unknown>;
  addPerspective(input: {
    scorecardId: string;
    nameEn: string;
    nameAr: string;
    order: number;
    approvalCaseId: string;
  }): Promise<unknown>;
  removePerspective(input: {
    scorecardId: string;
    perspectiveId: string;
    approvalCaseId: string;
  }): Promise<{ removed: true }>;
  reorderPerspectives(input: {
    scorecardId: string;
    orderedPerspectiveIds: string[];
    approvalCaseId: string;
  }): Promise<unknown[]>;
  setPlacement(input: {
    perspectiveId: string;
    objectiveNodeId: string;
  }): Promise<{ perspectiveId: string; objectiveNodeId: string }>;
  listPlacementDetails(scorecardId: string): Promise<ScorecardPlacementDetail[]>;
  previewWeighting(input: {
    scorecardId: string;
    draftWeights: Record<string, number>;
    scoringFormulaId?: string;
  }): Promise<unknown>;
  scoreTrend(scorecardId: string): Promise<Array<{ period: string; score: number }>>;
  proposeWeighting(input: {
    scorecardId: string;
    draftWeights: Record<string, number>;
    scoringFormulaId?: string;
    activeFrom: Date;
    actorUserId: string;
    approvalParticipantId: string;
  }): Promise<unknown>;
  publishWeighting(input: {
    scorecardId: string;
    approvalCaseId: string;
  }): Promise<unknown>;
  draftLink(input: {
    scorecardId: string;
    strategyMapId?: string;
    link: {
      fromObjectiveId: string;
      toObjectiveId: string;
      strength: "weak" | "strong";
    };
  }): Promise<unknown>;
  removeDraftLink(input: {
    strategyMapId: string;
    linkId: string;
  }): Promise<{ removed: true }>;
  proposeMap(input: {
    strategyMapId: string;
    actorUserId: string;
    approvalParticipantId: string;
  }): Promise<unknown>;
  publishMap(input: {
    strategyMapId: string;
    approvalCaseId: string;
  }): Promise<unknown>;
  getPublishedMap(scorecardId: string): Promise<unknown>;
}

export interface BalancedScorecardServiceContract {
  list(): Promise<unknown[]>;
  create(input: {
    nameEn: string;
    nameAr: string;
    scopeNodeId?: string | null;
    planVersionId: string;
    description?: string;
    department: string;
    period: string;
    ownerName: string;
    ownerInitials?: string;
    status: "on-track" | "at-risk" | "draft";
    score: number;
    priorScore?: number;
    reviewFrequency?: string;
    startDate?: string;
    endDate?: string;
    strategyName?: string;
    strategicTheme?: string;
    strategicObjective?: string;
    primaryPerspective?: "all" | "financial" | "customer" | "internal-process" | "learning-growth";
    strategicWeight?: number;
    tags?: string[];
    notes?: string;
    perspectives: Array<{
      key: "financial" | "customer" | "internal-process" | "learning-growth";
      owner: { initials: string; color: string };
      score: number;
      priorScore?: number;
      weight: number;
      kpis: Array<{
        name: string;
        status: "on-track" | "at-risk" | "draft";
        owner: { initials: string; color: string };
        score: number;
        priorScore?: number;
        weight?: number;
        actual?: string;
        target?: string;
        variance?: string;
        trend?: number[];
      }>;
    }>;
  }): Promise<unknown>;
}

declare module "./index" {
  interface TrpcContext {
    scorecard?: ScorecardServiceContract;
    balancedScorecard?: BalancedScorecardServiceContract;
  }
}

const id = z.string().uuid();
const weights = z.record(id, z.number().finite().positive());
const scorecardStatus = z.enum(["on-track", "at-risk", "draft"]);
const perspectiveKey = z.enum(["financial", "customer", "internal-process", "learning-growth"]);
const ownerSchema = z.object({ initials: z.string().trim().min(1).max(2), color: z.string().trim().min(1).max(100) }).strict();
const kpiSchema = z.object({
  name: z.string().trim().min(1).max(300),
  status: scorecardStatus,
  owner: ownerSchema,
  score: z.number().min(0).max(100),
  priorScore: z.number().min(0).max(100).optional(),
  weight: z.number().min(0).max(100).optional(),
  actual: z.string().max(100).optional(),
  target: z.string().max(100).optional(),
  variance: z.string().max(100).optional(),
  trend: z.array(z.number().finite()).max(60).optional(),
}).strict();
const perspectiveSchema = z.object({
  key: perspectiveKey,
  owner: ownerSchema,
  score: z.number().min(0).max(100),
  priorScore: z.number().min(0).max(100).optional(),
  weight: z.number().min(0).max(100),
  kpis: z.array(kpiSchema).max(100),
}).strict();

const scorecardAuthor = () => requireRole("strategy_analyst", "seo_administrator");
const mapEditor = () => requireRole("strategy_analyst");

function service(ctx: { scorecard?: ScorecardServiceContract }): ScorecardServiceContract {
  if (!ctx.scorecard) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Scorecard service unavailable" });
  }
  return ctx.scorecard;
}

function balancedService(ctx: { balancedScorecard?: BalancedScorecardServiceContract }): BalancedScorecardServiceContract {
  if (!ctx.balancedScorecard) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Balanced scorecard service unavailable" });
  }
  return ctx.balancedScorecard;
}

function fail(error: unknown): never {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;

  if (code === "SCORECARD_NOT_FOUND" || code === "SCORECARD_PERSPECTIVE_NOT_FOUND" || code === "SCORECARD_MAP_NOT_FOUND") {
    throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "Scorecard resource not found" });
  }
  if (code === "SCORECARD_APPROVAL_REQUIRED") {
    throw new TRPCError({ code: "FORBIDDEN", message: "This structural scorecard change requires an approved workflow case" });
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Scorecard operation failed" });
}

export const scorecardRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    try { return await service(ctx).listScorecards(); } catch (error) { return fail(error); }
  }),
  get: protectedProcedure.input(z.object({ scorecardId: id }).strict()).query(async ({ ctx, input }) => {
    try { return await service(ctx).getScorecard(input.scorecardId); } catch (error) { return fail(error); }
  }),
  create: scorecardAuthor()
    .input(z.object({
      nameEn: z.string().trim().min(1).max(300),
      nameAr: z.string().trim().min(1).max(300),
      scopeNodeId: id.nullable().optional(),
      planVersionId: id,
    }).strict())
    .mutation(async ({ ctx, input }) => {
      try { return await service(ctx).createScorecard(input); } catch (error) { return fail(error); }
    }),
  balanced: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try { return await balancedService(ctx).list(); } catch (error) { return fail(error); }
    }),
    create: scorecardAuthor()
      .input(z.object({
        nameEn: z.string().trim().min(1).max(300),
        nameAr: z.string().trim().min(1).max(300),
        scopeNodeId: id.nullable().optional(),
        planVersionId: id,
        description: z.string().max(2000).optional(),
        department: z.string().trim().min(1).max(200),
        period: z.string().trim().min(1).max(100),
        ownerName: z.string().trim().min(1).max(200),
        ownerInitials: z.string().trim().min(1).max(2).optional(),
        status: scorecardStatus,
        score: z.number().min(0).max(100),
        priorScore: z.number().min(0).max(100).optional(),
        reviewFrequency: z.string().max(100).optional(),
        startDate: z.string().max(100).optional(),
        endDate: z.string().max(100).optional(),
        strategyName: z.string().max(300).optional(),
        strategicTheme: z.string().max(300).optional(),
        strategicObjective: z.string().max(300).optional(),
        primaryPerspective: z.union([z.literal("all"), perspectiveKey]).optional(),
        strategicWeight: z.number().min(0).max(100).optional(),
        tags: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
        notes: z.string().max(4000).optional(),
        perspectives: z.array(perspectiveSchema).min(1).max(10),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await balancedService(ctx).create(input); } catch (error) { return fail(error); }
      }),
  }),
  perspective: router({
    add: scorecardAuthor()
      .input(z.object({ scorecardId: id, nameEn: z.string().trim().min(1).max(300), nameAr: z.string().trim().min(1).max(300), order: z.number().int().min(0), approvalCaseId: id }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).addPerspective(input); } catch (error) { return fail(error); }
      }),
    remove: scorecardAuthor()
      .input(z.object({ scorecardId: id, perspectiveId: id, approvalCaseId: id }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).removePerspective(input); } catch (error) { return fail(error); }
      }),
    reorder: scorecardAuthor()
      .input(z.object({ scorecardId: id, orderedPerspectiveIds: z.array(id).min(1), approvalCaseId: id }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).reorderPerspectives(input); } catch (error) { return fail(error); }
      }),
  }),
  placement: router({
    set: scorecardAuthor()
      .input(z.object({ perspectiveId: id, objectiveNodeId: id }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).setPlacement(input); } catch (error) { return fail(error); }
      }),
    list: protectedProcedure.input(z.object({ scorecardId: id }).strict()).query(async ({ ctx, input }) => {
      try { return await service(ctx).listPlacementDetails(input.scorecardId); } catch (error) { return fail(error); }
    }),
  }),
  weighting: router({
    preview: protectedProcedure
      .input(z.object({ scorecardId: id, draftWeights: weights, scoringFormulaId: id.optional() }).strict())
      .query(async ({ ctx, input }) => {
        try { return await service(ctx).previewWeighting(input); } catch (error) { return fail(error); }
      }),
    trend: protectedProcedure
      .input(z.object({ scorecardId: id }).strict())
      .query(async ({ ctx, input }) => {
        try { return await service(ctx).scoreTrend(input.scorecardId); } catch (error) { return fail(error); }
      }),
    propose: scorecardAuthor()
      .input(z.object({ scorecardId: id, draftWeights: weights, scoringFormulaId: id.optional(), activeFrom: z.coerce.date(), approvalParticipantId: id }).strict())
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).proposeWeighting({ ...input, actorUserId: ctx.session!.user.id });
        } catch (error) { return fail(error); }
      }),
    publish: scorecardAuthor()
      .input(z.object({ scorecardId: id, approvalCaseId: id }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).publishWeighting(input); } catch (error) { return fail(error); }
      }),
  }),
  map: router({
    getPublished: protectedProcedure.input(z.object({ scorecardId: id }).strict()).query(async ({ ctx, input }) => {
      try { return await service(ctx).getPublishedMap(input.scorecardId); } catch (error) { return fail(error); }
    }),
    placeObjective: mapEditor()
      .input(z.object({ perspectiveId: id, objectiveNodeId: id }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).setPlacement(input); } catch (error) { return fail(error); }
      }),
    draftLink: mapEditor()
      .input(z.object({
        scorecardId: id,
        strategyMapId: id.optional(),
        link: z.object({ fromObjectiveId: id, toObjectiveId: id, strength: z.enum(["weak", "strong"]) }).strict(),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).draftLink(input); } catch (error) { return fail(error); }
      }),
    removeLink: mapEditor()
      .input(z.object({ strategyMapId: id, linkId: id }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).removeDraftLink(input); } catch (error) { return fail(error); }
      }),
    propose: mapEditor()
      .input(z.object({ strategyMapId: id, approvalParticipantId: id }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).proposeMap({ ...input, actorUserId: ctx.session!.user.id }); } catch (error) { return fail(error); }
      }),
    publish: scorecardAuthor()
      .input(z.object({ strategyMapId: id, approvalCaseId: id }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).publishMap(input); } catch (error) { return fail(error); }
      }),
  }),
});

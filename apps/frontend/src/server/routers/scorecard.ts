import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";

const id = z.string().uuid();
const weights = z.record(id, z.number().finite().positive());
const scorecardStatus = z.enum(["on-track", "at-risk", "draft"]);
const perspectiveKey = z.enum(["financial", "customer", "internal-process", "learning-growth"]);
const owner = z.object({ initials: z.string().trim().min(1).max(2), color: z.string().trim().min(1).max(100) }).strict();
const kpi = z.object({
  name: z.string().trim().min(1).max(300), status: scorecardStatus, owner,
  score: z.number().min(0).max(100), priorScore: z.number().min(0).max(100).optional(),
  weight: z.number().min(0).max(100).optional(), actual: z.string().max(100).optional(),
  target: z.string().max(100).optional(), variance: z.string().max(100).optional(),
  trend: z.array(z.number().finite()).max(60).optional(),
}).strict();
const perspective = z.object({
  key: perspectiveKey, owner, score: z.number().min(0).max(100),
  priorScore: z.number().min(0).max(100).optional(), weight: z.number().min(0).max(100),
  kpis: z.array(kpi).max(100),
}).strict();
const balancedCreate = z.object({
  nameEn: z.string().trim().min(1).max(300), nameAr: z.string().trim().min(1).max(300),
  scopeNodeId: id.nullable().optional(), planVersionId: id,
  description: z.string().max(2000).optional(), department: z.string().trim().min(1).max(200),
  period: z.string().trim().min(1).max(100), ownerName: z.string().trim().min(1).max(200),
  ownerInitials: z.string().trim().min(1).max(2).optional(), status: scorecardStatus,
  score: z.number().min(0).max(100), priorScore: z.number().min(0).max(100).optional(),
  reviewFrequency: z.string().max(100).optional(), startDate: z.string().max(100).optional(),
  endDate: z.string().max(100).optional(), strategyName: z.string().max(300).optional(),
  strategicTheme: z.string().max(300).optional(), strategicObjective: z.string().max(300).optional(),
  primaryPerspective: z.union([z.literal("all"), perspectiveKey]).optional(),
  strategicWeight: z.number().min(0).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(30).optional(), notes: z.string().max(4000).optional(),
  perspectives: z.array(perspective).min(1).max(10),
}).strict();

const backend = (ctx: { cookieHeader: string | null }) => createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

export const scorecardRouter = router({
  list: authenticatedProcedure.query(({ ctx }) => forward(() => backend(ctx).scorecard.list.query())),
  get: authenticatedProcedure.input(z.object({ scorecardId: id }).strict())
    .query(({ ctx, input }) => forward(() => backend(ctx).scorecard.get.query(input))),
  balanced: router({
    list: authenticatedProcedure.query(({ ctx }) => forward(() => backend(ctx).scorecard.balanced.list.query())),
    create: authenticatedProcedure.input(balancedCreate)
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecard.balanced.create.mutate(input))),
  }),
  placement: router({
    list: authenticatedProcedure.input(z.object({ scorecardId: id }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).scorecard.placement.list.query(input))),
  }),
  weighting: router({
    preview: authenticatedProcedure
      .input(z.object({ scorecardId: id, draftWeights: weights, scoringFormulaId: id.optional() }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).scorecard.weighting.preview.query(input))),
    trend: authenticatedProcedure
      .input(z.object({ scorecardId: id }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).scorecard.weighting.trend.query(input))),
  }),
});

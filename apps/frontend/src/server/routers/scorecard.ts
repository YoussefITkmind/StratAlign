import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";

const id = z.string().uuid();
const weights = z.record(id, z.number().finite().positive());
const uiData = z.record(z.string(), z.unknown());
const backend = (ctx: { cookieHeader: string | null }) => createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

export const scorecardRouter = router({
  list: authenticatedProcedure.query(({ ctx }) => forward(() => backend(ctx).scorecard.list.query())),
  get: authenticatedProcedure.input(z.object({ scorecardId: id }).strict())
    .query(({ ctx, input }) => forward(() => backend(ctx).scorecard.get.query(input))),
  create: authenticatedProcedure
    .input(z.object({
      nameEn: z.string().trim().min(1).max(300),
      nameAr: z.string().trim().min(1).max(300),
      scopeNodeId: id.nullable().optional(),
      planVersionId: id,
    }).strict())
    .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecard.create.mutate(input))),
  ui: router({
    list: authenticatedProcedure.query(({ ctx }) => forward(() => backend(ctx).scorecard.ui.list.query())),
    save: authenticatedProcedure
      .input(z.object({ scorecardId: id, uiData }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecard.ui.save.mutate(input))),
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

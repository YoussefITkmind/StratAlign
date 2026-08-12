import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";

const id = z.string().uuid();
const weights = z.record(id, z.number().finite().positive());
const backend = (ctx: { cookieHeader: string | null }) => createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

export const scorecardRouter = router({
  list: authenticatedProcedure.query(({ ctx }) => forward(() => backend(ctx).scorecard.list.query())),
  get: authenticatedProcedure.input(z.object({ scorecardId: id }).strict())
    .query(({ ctx, input }) => forward(() => backend(ctx).scorecard.get.query(input))),
  placement: router({
    list: authenticatedProcedure.input(z.object({ scorecardId: id }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).scorecard.placement.list.query(input))),
  }),
  weighting: router({
    preview: authenticatedProcedure
      .input(z.object({ scorecardId: id, draftWeights: weights, scoringFormulaId: id.optional() }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).scorecard.weighting.preview.query(input))),
  }),
  map: router({
    getPublished: authenticatedProcedure.input(z.object({ scorecardId: id }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).scorecard.map.getPublished.query(input))),
    draftLink: authenticatedProcedure
      .input(z.object({
        scorecardId: id,
        strategyMapId: id.optional(),
        link: z.object({ fromObjectiveId: id, toObjectiveId: id, strength: z.enum(["weak", "strong"]) }).strict(),
      }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecard.map.draftLink.mutate(input))),
    removeLink: authenticatedProcedure
      .input(z.object({ strategyMapId: id, linkId: id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecard.map.removeLink.mutate(input))),
    propose: authenticatedProcedure
      .input(z.object({ strategyMapId: id, approvalParticipantId: id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecard.map.propose.mutate(input))),
    publish: authenticatedProcedure
      .input(z.object({ strategyMapId: id, approvalCaseId: id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecard.map.publish.mutate(input))),
  }),
});

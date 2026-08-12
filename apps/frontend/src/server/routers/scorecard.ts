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
  weighting: router({
    preview: authenticatedProcedure
      .input(z.object({ scorecardId: id, draftWeights: weights, scoringFormulaId: id.optional() }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).scorecard.weighting.preview.query(input))),
    propose: authenticatedProcedure
      .input(z.object({ scorecardId: id, draftWeights: weights, scoringFormulaId: id.optional(), activeFrom: z.coerce.date(), approvalParticipantId: id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecard.weighting.propose.mutate(input))),
    publish: authenticatedProcedure
      .input(z.object({ scorecardId: id, approvalCaseId: id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecard.weighting.publish.mutate(input))),
  }),
});

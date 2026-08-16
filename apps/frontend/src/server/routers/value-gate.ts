import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import {
  createBackendGovernanceClient,
  translateBackendGovernanceError,
} from "@/server/backend-governance-client";

function backend(ctx: { cookieHeader: string | null }) {
  return createBackendGovernanceClient(ctx.cookieHeader);
}

export const valueGateRouter = router({
  decide: authenticatedProcedure
    .input(z.object({
      gateReviewId: z.string().uuid(),
      decision: z.enum(["continue", "intervene", "stop"]),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await backend(ctx).value.gate.decide.mutate(input);
      } catch (error) {
        translateBackendGovernanceError(error);
      }
    }),
});

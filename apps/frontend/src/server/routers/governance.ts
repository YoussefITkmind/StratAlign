import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { OwnSubmissionError, adminProcedure, router } from "@/server/trpc";
import { governanceCases, recordAudit } from "@/server/mock-db";

export const governanceRouter = router({
  /**
   * Cases pending a decision from this approver. Excludes the viewer's own
   * submissions up front (separation of duties) — `decide` enforces the same
   * rule again server-side so a direct call can't bypass it via a stale list.
   */
  myPendingApprovals: adminProcedure.query(({ ctx }) => {
    return governanceCases
      .filter((c) => c.status === "pending" && c.submittedBy !== ctx.user.email)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }),

  getCase: adminProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    const found = governanceCases.find((c) => c.id === input.id);
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found." });
    return found;
  }),

  decide: adminProcedure
    .input(
      z.object({
        id: z.string(),
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      const item = governanceCases.find((c) => c.id === input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found." });
      if (item.status !== "pending") {
        throw new TRPCError({ code: "CONFLICT", message: "Case already decided." });
      }
      // Separation of duties: enforced here regardless of what the list
      // endpoint returned, so a direct procedure call can't bypass it.
      if (item.submittedBy === ctx.user.email) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot approve or reject your own submission.",
          cause: new OwnSubmissionError(),
        });
      }

      item.status = input.decision;
      item.decidedBy = ctx.user.email;
      item.decidedAt = new Date().toISOString();
      item.decisionReason = input.reason;

      recordAudit(
        `governance.case.${input.decision}`,
        ctx.user.email,
        `Case ${item.id} (${item.caseType}) submitted by ${item.submittedBy}`
      );

      return item;
    }),
});

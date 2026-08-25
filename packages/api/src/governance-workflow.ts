import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./index";

interface GovernanceCaseRecord {
  id: string;
  entityType: string;
  entityId: string;
  submittedBy: string;
  approvalParticipantId: string | null;
  currentState: string;
}

type GovernanceCaseWithRuntime = GovernanceCaseRecord & Record<string, unknown>;

type GovernanceWorkflowEvent =
  | {
      type: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
      actorUserId: string;
      rationale?: string;
    }
  | {
      type: "RESUBMIT";
      actorUserId: string;
    };

interface GovernanceWorkflowService {
  getCase(caseId: string): Promise<GovernanceCaseWithRuntime>;
  getLatestCaseForEntity(
    entityType: string,
    entityId: string,
  ): Promise<GovernanceCaseWithRuntime | null>;
  transition(input: {
    caseId: string;
    event: GovernanceWorkflowEvent;
  }): Promise<GovernanceCaseWithRuntime>;
}

interface IamDirectoryService {
  listCredentialUsers(): Promise<unknown[]>;
}

function governance(ctx: unknown): GovernanceWorkflowService {
  const value = (ctx as { governance?: unknown }).governance;
  if (!value) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Governance service unavailable",
    });
  }
  return value as GovernanceWorkflowService;
}

function iam(ctx: unknown): IamDirectoryService {
  const value = (ctx as { iam?: unknown }).iam;
  if (!value) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "IAM directory unavailable",
    });
  }
  return value as IamDirectoryService;
}

export const governanceWorkflowRouter = router({
  latestForEntities: protectedProcedure
    .input(
      z.object({
        entityType: z.string().trim().min(1).max(150),
        entityIds: z.array(z.string().trim().min(1).max(200)).max(1000),
      }).strict(),
    )
    .query(async ({ ctx, input }) => {
      const service = governance(ctx);
      const entityIds = [...new Set(input.entityIds)];
      const cases = await Promise.all(
        entityIds.map((entityId) =>
          service.getLatestCaseForEntity(input.entityType, entityId),
        ),
      );
      return cases.filter(
        (item): item is GovernanceCaseWithRuntime => item !== null,
      );
    }),

  approvers: protectedProcedure.query(async ({ ctx }) => {
    const users = await iam(ctx).listCredentialUsers();
    return users.flatMap((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return [];
      }

      const row = value as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : null;
      const email = typeof row.email === "string" ? row.email.trim() : "";
      const displayName =
        typeof row.displayName === "string" ? row.displayName.trim() : "";

      if (!id) return [];
      return [{ id, name: displayName || email || "User" }];
    });
  }),

  decide: protectedProcedure
    .input(
      z.object({
        caseId: z.string().uuid(),
        decision: z.enum(["approve", "reject", "request_changes"]),
        rationale: z.string().trim().max(4000).optional(),
      }).strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const service = governance(ctx);
      const approvalCase = await service.getCase(input.caseId);

      if (approvalCase.approvalParticipantId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the assigned approver can decide this approval case.",
        });
      }

      if (approvalCase.currentState !== "PENDING_APPROVAL") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Only a pending approval case can be decided.",
        });
      }

      const type =
        input.decision === "approve"
          ? "APPROVE" as const
          : input.decision === "request_changes"
            ? "REQUEST_CHANGES" as const
            : "REJECT" as const;

      return service.transition({
        caseId: input.caseId,
        event: {
          type,
          actorUserId: ctx.session.user.id,
          ...(input.rationale ? { rationale: input.rationale } : {}),
        },
      });
    }),

  resubmit: protectedProcedure
    .input(z.object({ caseId: z.string().uuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const service = governance(ctx);
      const approvalCase = await service.getCase(input.caseId);

      if (approvalCase.submittedBy !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the original submitter can resubmit this approval case.",
        });
      }

      if (approvalCase.currentState !== "CHANGES_REQUESTED") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Only a changes-requested case can be resubmitted.",
        });
      }

      return service.transition({
        caseId: input.caseId,
        event: {
          type: "RESUBMIT",
          actorUserId: ctx.session.user.id,
        },
      });
    }),
});

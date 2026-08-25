import { z } from "zod";

import {
  authenticatedProcedure,
  router,
} from "@/server/trpc";

import {
  createBackendGovernanceClient,
  translateBackendGovernanceError,
} from "@/server/backend-governance-client";

interface BackendGovernanceCase {
  id: string;
  entityType: string;
  entityId: string;
  submittedBy: string;
  approvalParticipantId: string | null;
  currentState: string;
  xstateContextSnapshot?: unknown;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  escalations?: unknown[];
  decisionLog?: Array<{
    decidedBy?: string;
    decidedAt?: string | Date;
    rationale?: string | null;
  }> | null;
}

function backend(ctx: { cookieHeader: string | null }) {
  return createBackendGovernanceClient(ctx.cookieHeader);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function diffValue(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (value === undefined) return {};
  return { value };
}

function extractProposedChange(snapshot: unknown) {
  const root = asRecord(snapshot);
  const context = asRecord(root.context);
  const proposedChange = asRecord(context.proposedChange);

  return {
    before: diffValue(proposedChange.before),
    after: diffValue(proposedChange.after),
    impactSummary: proposedChange.impactSummary,
  };
}

function mapStatus(state: string) {
  switch (state) {
    case "DRAFT":
      return "draft" as const;
    case "PENDING_APPROVAL":
      return "pending" as const;
    case "APPROVED":
      return "approved" as const;
    case "REJECTED":
      return "rejected" as const;
    case "CHANGES_REQUESTED":
      return "changes_requested" as const;
    default:
      throw new Error(`Unsupported governance state: ${state}`);
  }
}

function toFrontendCase(item: BackendGovernanceCase) {
  const latestDecision = item.decisionLog?.[0];

  return {
    id: item.id,
    caseType: item.entityType,
    entityType: item.entityType,
    entityId: item.entityId,
    status: mapStatus(item.currentState),
    submittedBy: item.submittedBy,
    approvalParticipantId: item.approvalParticipantId,
    createdAt: item.createdAt ? String(item.createdAt) : "",
    updatedAt: item.updatedAt ? String(item.updatedAt) : "",
    escalated: Array.isArray(item.escalations) && item.escalations.length > 0,
    proposedChange: extractProposedChange(item.xstateContextSnapshot),
    decidedBy: latestDecision?.decidedBy,
    decidedAt: latestDecision?.decidedAt
      ? String(latestDecision.decidedAt)
      : undefined,
    decisionReason: latestDecision?.rationale ?? undefined,
  };
}

const caseIdSchema = z.string().uuid();
const entityInputSchema = z.object({
  entityType: z.string().trim().min(1).max(150),
  entityId: z.string().trim().min(1).max(200),
}).strict();

export const governanceRouter = router({
  submit: authenticatedProcedure
    .input(z.object({
      entityType: z.string().trim().min(1).max(150),
      entityId: z.string().trim().min(1).max(200),
      approvalParticipantId: z.string().uuid(),
      proposedChange: z.object({
        before: z.unknown(),
        after: z.unknown(),
        impactSummary: z.unknown().optional(),
      }).strict(),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await backend(ctx).governance.submit.mutate(input);
      } catch (error) {
        translateBackendGovernanceError(error);
      }
    }),

  myPendingApprovals: authenticatedProcedure.query(async ({ ctx }) => {
    try {
      const cases = await backend(ctx).governance.myPendingApprovals.query();
      return cases.map((item) => toFrontendCase(item));
    } catch (error) {
      translateBackendGovernanceError(error);
    }
  }),

  getCase: authenticatedProcedure
    .input(z.object({ id: caseIdSchema }).strict())
    .query(async ({ ctx, input }) => {
      try {
        const item = await backend(ctx).governance.getCase.query({
          caseId: input.id,
        });
        return toFrontendCase(item);
      } catch (error) {
        translateBackendGovernanceError(error);
      }
    }),

  getLatestCaseForEntity: authenticatedProcedure
    .input(entityInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const item = await backend(ctx).governance.getLatestCaseForEntity.query(input);
        return item ? toFrontendCase(item) : null;
      } catch (error) {
        translateBackendGovernanceError(error);
      }
    }),

  getLatestCasesForEntities: authenticatedProcedure
    .input(z.object({
      entityType: z.string().trim().min(1).max(150),
      entityIds: z.array(z.string().trim().min(1).max(200)).max(1000),
    }).strict())
    .query(async ({ ctx, input }) => {
      try {
        const items = await backend(ctx).governanceWorkflow.latestForEntities.query(input);
        return items.map((item) => toFrontendCase(item));
      } catch (error) {
        translateBackendGovernanceError(error);
      }
    }),

  listApprovers: authenticatedProcedure.query(async ({ ctx }) => {
    try {
      return await backend(ctx).governanceWorkflow.approvers.query();
    } catch (error) {
      translateBackendGovernanceError(error);
    }
  }),

  resubmit: authenticatedProcedure
    .input(z.object({ id: caseIdSchema }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        const item = await backend(ctx).governanceWorkflow.resubmit.mutate({
          caseId: input.id,
        });
        return toFrontendCase(item);
      } catch (error) {
        translateBackendGovernanceError(error);
      }
    }),

  decide: authenticatedProcedure
    .input(z.object({
      id: caseIdSchema,
      decision: z.enum(["approved", "rejected", "changes_requested"]),
      reason: z.string().trim().max(4000).optional(),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        const item = await backend(ctx).governanceWorkflow.decide.mutate({
          caseId: input.id,
          decision:
            input.decision === "approved"
              ? "approve"
              : input.decision === "changes_requested"
                ? "request_changes"
                : "reject",
          ...(input.reason ? { rationale: input.reason } : {}),
        });
        return toFrontendCase(item);
      } catch (error) {
        translateBackendGovernanceError(error);
      }
    }),

  listDecisions: authenticatedProcedure.query(async ({ ctx }) => {
    try {
      const entries = await backend(ctx).governance.listDecisions.query();
      return entries.map((entry) => ({
        id: entry.id,
        caseId: entry.caseId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        decision: (entry.decision === "APPROVED"
          ? "approved"
          : entry.decision === "REJECTED"
            ? "rejected"
            : "changes_requested") as
          | "approved"
          | "rejected"
          | "changes_requested",
        decidedBy: entry.decidedBy,
        decidedAt: String(entry.decidedAt),
        rationale: entry.rationale,
      }));
    } catch (error) {
      translateBackendGovernanceError(error);
    }
  }),
});

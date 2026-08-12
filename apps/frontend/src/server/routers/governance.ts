import {
  z,
} from "zod";

import {
  authenticatedProcedure,
  router,
} from "@/server/trpc";

import {
  createBackendGovernanceClient,
  translateBackendGovernanceError,
} from "@/server/backend-governance-client";

type BackendGovernanceState =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED";

interface BackendGovernanceCase {
  id: string;
  workflowDefinitionId: string;
  entityType: string;
  entityId: string;
  submittedBy: string;
  approvalParticipantId:
    string | null;
  approvalSlaMs: number;
  currentState:
    BackendGovernanceState;
  xstateContextSnapshot:
    unknown;
  createdAt:
    string | Date;
  updatedAt:
    string | Date;
}

function backend(
  ctx: {
    cookieHeader:
      string | null;
  },
) {
  return createBackendGovernanceClient(
    ctx.cookieHeader,
  );
}

function asRecord(
  value: unknown,
): Record<string, unknown> {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as
      Record<string, unknown>;
  }

  return {};
}

function diffValue(
  value: unknown,
): Record<string, unknown> {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as
      Record<string, unknown>;
  }

  if (value === undefined) {
    return {};
  }

  return {
    value,
  };
}

function extractProposedChange(
  snapshot: unknown,
) {
  const root =
    asRecord(snapshot);

  const context =
    asRecord(
      root.context,
    );

  const proposedChange =
    asRecord(
      context.proposedChange,
    );

  return {
    before:
      diffValue(
        proposedChange.before,
      ),

    after:
      diffValue(
        proposedChange.after,
      ),

    impactSummary:
      proposedChange
        .impactSummary,
  };
}

function mapStatus(
  state:
    BackendGovernanceState,
) {
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
  }
}

function toFrontendCase(
  item:
    BackendGovernanceCase,
) {
  /*
   * getCase currently returns richer runtime data
   * from GovernanceService than the public contract
   * requires. Use it when present without making
   * the frontend depend on those extra fields.
   */
  const runtime =
    item as BackendGovernanceCase & {
      escalations?: unknown[];
      decisionLog?: {
        decidedBy?: string;
        decidedAt?:
          string | Date;
        rationale?:
          string | null;
      } | null;
    };

  return {
    id:
      item.id,

    caseType:
      item.entityType,

    entityType:
      item.entityType,

    entityId:
      item.entityId,

    status:
      mapStatus(
        item.currentState,
      ),

    submittedBy:
      item.submittedBy,

    approvalParticipantId:
      item.approvalParticipantId,

    createdAt:
      String(
        item.createdAt,
      ),

    updatedAt:
      String(
        item.updatedAt,
      ),

    escalated:
      Array.isArray(
        runtime.escalations,
      ) &&
      runtime.escalations
        .length > 0,

    proposedChange:
      extractProposedChange(
        item.xstateContextSnapshot,
      ),

    decidedBy:
      runtime.decisionLog
        ?.decidedBy,

    decidedAt:
      runtime.decisionLog
        ?.decidedAt
        ? String(
            runtime
              .decisionLog
              .decidedAt,
          )
        : undefined,

    decisionReason:
      runtime.decisionLog
        ?.rationale ??
      undefined,
  };
}

const caseIdSchema =
  z.string().uuid();

export const governanceRouter =
  router({
    submit:
      authenticatedProcedure
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

    myPendingApprovals:
      authenticatedProcedure
        .query(
          async ({ ctx }) => {
            try {
              const cases =
                await backend(
                  ctx,
                )
                  .governance
                  .myPendingApprovals
                  .query();

              return cases.map(
                (item) =>
                  toFrontendCase(
                    item as
                      BackendGovernanceCase,
                  ),
              );
            } catch (error) {
              translateBackendGovernanceError(
                error,
              );
            }
          },
        ),

    getCase:
      authenticatedProcedure
        .input(
          z.object({
            id:
              caseIdSchema,
          }).strict(),
        )
        .query(
          async ({
            ctx,
            input,
          }) => {
            try {
              const item =
                await backend(
                  ctx,
                )
                  .governance
                  .getCase
                  .query({
                    caseId:
                      input.id,
                  });

              return toFrontendCase(
                item as
                  BackendGovernanceCase,
              );
            } catch (error) {
              translateBackendGovernanceError(
                error,
              );
            }
          },
        ),

    getLatestCaseForEntity:
      authenticatedProcedure
        .input(z.object({
          entityType: z.string().trim().min(1).max(150),
          entityId: z.string().trim().min(1).max(200),
        }).strict())
        .query(async ({ ctx, input }) => {
          try {
            const item = await backend(ctx).governance.getLatestCaseForEntity.query(input);
            return item ? toFrontendCase(item as BackendGovernanceCase) : null;
          } catch (error) {
            translateBackendGovernanceError(error);
          }
        }),

    decide:
      authenticatedProcedure
        .input(
          z.object({
            id:
              caseIdSchema,

            decision:
              z.enum([
                "approved",
                "rejected",
                "changes_requested",
              ]),

            reason:
              z.string()
                .trim()
                .max(4000)
                .optional(),
          }).strict(),
        )
        .mutation(
          async ({
            ctx,
            input,
          }) => {
            try {
              const item =
                await backend(
                  ctx,
                )
                  .governance
                  .decide
                  .mutate({
                    caseId:
                      input.id,

                    decision:
                      input.decision ===
                        "approved"
                        ? "approve"
                        : input.decision ===
                            "changes_requested"
                          ? "request_changes"
                          : "reject",

                    ...(input.reason
                      ? {
                          rationale:
                            input.reason,
                        }
                      : {}),
                  });

              return toFrontendCase(
                item as
                  BackendGovernanceCase,
              );
            } catch (error) {
              translateBackendGovernanceError(
                error,
              );
            }
          },
        ),
  });

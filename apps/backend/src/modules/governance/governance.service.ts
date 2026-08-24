import {
  ApprovalCaseState,
  ApprovalDecision,
  Prisma,
} from "../../generated/prisma/client";
import type { PrismaService } from "../../database/prisma.service";
import type { EventBusService } from "../../events/event-bus.service";
import type { RulesService } from "../rules/rules.service";

import {
  enforceSeparationOfDuties,
} from "@spm/domain-iam";

import {
  APPROVAL_ACTION_REFS,
  DEFAULT_APPROVAL_WORKFLOW_DEFINITION,
  createApprovalActor,
  parseWorkflowDefinition,
  type ApprovalActionImplementations,
  type ApprovalMachineEvent,
  type ApprovalMachineSnapshot,
  type ApprovalState,
  type ProposedChange,
} from "@spm/machines";

import {
  GOVERNANCE_AGGREGATE_TYPE,
  GOVERNANCE_EVENT_TYPES,
  GOVERNANCE_EVENT_VERSION,
  governanceDecisionDedupeKey,
  governancePendingDedupeKey,
  type GovernanceDecisionPayload,
  type GovernanceApprovalPendingPayload,
} from "./governance.events";

import {
  GovernanceApprovalReferenceError,
  GovernanceCaseNotFoundError,
  GovernanceIllegalTransitionError,
  GovernanceWorkflowNotFoundError,
} from "./governance.errors";

const DEFAULT_WORKFLOW_KEY =
  DEFAULT_APPROVAL_WORKFLOW_DEFINITION.key;

function toJson(
  value: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}

function stateValueToPrisma(
  value: unknown,
): ApprovalCaseState {
  switch (value) {
    case "draft":
      return ApprovalCaseState.DRAFT;

    case "pending_approval":
      return ApprovalCaseState.PENDING_APPROVAL;

    case "approved":
      return ApprovalCaseState.APPROVED;

    case "rejected":
      return ApprovalCaseState.REJECTED;

    case "changes_requested":
      return ApprovalCaseState.CHANGES_REQUESTED;

    default:
      throw new Error(
        `Unsupported approval state: ${String(value)}`,
      );
  }
}


function prismaStateToMachine(
  state: ApprovalCaseState,
): ApprovalState {
  switch (state) {
    case ApprovalCaseState.DRAFT:
      return "draft";

    case ApprovalCaseState.PENDING_APPROVAL:
      return "pending_approval";

    case ApprovalCaseState.APPROVED:
      return "approved";

    case ApprovalCaseState.REJECTED:
      return "rejected";

    case ApprovalCaseState.CHANGES_REQUESTED:
      return "changes_requested";
  }
}

export interface CreateApprovalCaseInput {
  workflowKey?: string;
  entityType: string;
  entityId: string;
  submittedBy: string;
  approvalParticipantId: string;
  approvalSlaMs?: number;
  proposedChange: ProposedChange;
}

export interface TransitionApprovalCaseInput {
  caseId: string;
  event: ApprovalMachineEvent;
}

export interface ApprovalReferenceInput {
  approvalCaseId: string;
  entityType: string;
  entityId: string;
}

export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly rules?: RulesService,
  ) {}

  async ensureDefaultWorkflowDefinition() {
    return this.ensureDefaultWorkflowDefinitionWithClient(this.prisma);
  }

  private async ensureDefaultWorkflowDefinitionWithClient(
    client: PrismaService | Prisma.TransactionClient,
  ) {
    return client.workflowDefinition.upsert({
      where: {
        workflowKey_version: {
          workflowKey: DEFAULT_WORKFLOW_KEY,
          version:
            DEFAULT_APPROVAL_WORKFLOW_DEFINITION.version,
        },
      },

      create: {
        workflowKey: DEFAULT_WORKFLOW_KEY,
        version:
          DEFAULT_APPROVAL_WORKFLOW_DEFINITION.version,
        definitionJson: toJson(
          DEFAULT_APPROVAL_WORKFLOW_DEFINITION,
        ),
        isCurrent: true,
      },

      update: {},
    });
  }

  async submitCase(input: CreateApprovalCaseInput) {
    const created = await this.createCase(input);
    return this.transition({
      caseId: created.id,
      event: {
        type: "SUBMIT",
        actorUserId: input.submittedBy,
      },
    });
  }

  async createCase(
    input: CreateApprovalCaseInput,
  ) {
    return this.createCaseWithClient(this.prisma, input);
  }

  async createCaseInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateApprovalCaseInput,
  ) {
    return this.createCaseWithClient(tx, input);
  }

  private async createCaseWithClient(
    client: PrismaService | Prisma.TransactionClient,
    input: CreateApprovalCaseInput,
  ) {
    const workflowKey =
      input.workflowKey ?? DEFAULT_WORKFLOW_KEY;

    if (workflowKey === DEFAULT_WORKFLOW_KEY) {
      await this.ensureDefaultWorkflowDefinitionWithClient(client);
    }

    const definition =
      await client.workflowDefinition.findFirst({
        where: {
          workflowKey,
          isCurrent: true,
        },
        orderBy: {
          version: "desc",
        },
      });

    if (!definition) {
      throw new GovernanceWorkflowNotFoundError(
        workflowKey,
      );
    }

    const parsedDefinition =
      parseWorkflowDefinition(
        definition.definitionJson,
      );

    const actor = createApprovalActor({
      context: {
        submittedBy: input.submittedBy,
        proposedChange: input.proposedChange,
      },

      definition: parsedDefinition,

      separationOfDutiesCheck: (
        submittedBy,
        actorUserId,
      ) => submittedBy !== actorUserId,
    }).start();

    const persisted =
      actor.getPersistedSnapshot();

    return client.approvalCase.create({
      data: {
        workflowDefinitionId: definition.id,
        entityType: input.entityType,
        entityId: input.entityId,
        submittedBy: input.submittedBy,
        approvalParticipantId:
          input.approvalParticipantId,
        approvalSlaMs:
          input.approvalSlaMs ??
          86_400_000,
        currentState: stateValueToPrisma(
          actor.getSnapshot().value,
        ),
        xstateContextSnapshot:
          toJson(persisted),
      },
    });
  }

  async transition(
    input: TransitionApprovalCaseInput,
  ) {
    let publishedEvent = false;

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtext(${`governance.approval:${input.caseId}`})
            )
          `;

          const approvalCase =
            await tx.approvalCase.findUnique({
              where: {
                id: input.caseId,
              },

              include: {
                workflowDefinition: true,
              },
            });

          if (!approvalCase) {
            throw new GovernanceCaseNotFoundError(
              input.caseId,
            );
          }

          if (
            input.event.type === "APPROVE" ||
            input.event.type === "REJECT"
          ) {
            enforceSeparationOfDuties(
              input.event.actorUserId,
              approvalCase.submittedBy,
            );
          }

          const definition =
            parseWorkflowDefinition(
              approvalCase.workflowDefinition
                .definitionJson,
            );

          const proposedChange =
            (
              approvalCase
                .xstateContextSnapshot as {
                context?: {
                  proposedChange?: ProposedChange;
                };
              }
            ).context?.proposedChange ?? {
              before: null,
              after: null,
            };

          const machineState =
            prismaStateToMachine(
              approvalCase.currentState,
            );

          const transitionDefinition =
            definition.states[
              machineState
            ].on?.[
              input.event.type
            ];

          const configuredGuard =
            transitionDefinition?.guard;

          let ruleGatePassed:
            boolean | undefined;

          if (
            configuredGuard &&
            typeof configuredGuard !==
              "string" &&
            configuredGuard.type ===
              "ruleGate"
          ) {
            if (!this.rules) {
              throw new Error(
                "Rule-backed workflow guard cannot be evaluated because RulesService is unavailable",
              );
            }

            const ruleInput =
              configuredGuard.inputSource ===
                "proposedChange.before"
                ? proposedChange.before
                : configuredGuard.inputSource ===
                    "proposedChange.impactSummary"
                  ? proposedChange
                      .impactSummary
                  : proposedChange.after;

            const ruleResult =
              await this.rules.evaluate(
                configuredGuard.ruleId,
                ruleInput,
              );

            if (
              typeof ruleResult !==
                "object" ||
              ruleResult === null ||
              !("passed" in ruleResult) ||
              typeof ruleResult.passed !==
                "boolean"
            ) {
              throw new Error(
                "Workflow ruleGate must reference a gate_criteria rule that returns passed:boolean",
              );
            }

            ruleGatePassed =
              ruleResult.passed;
          }

          const effects =
            new Set<
              (typeof APPROVAL_ACTION_REFS)[number]
            >();

          const actions =
            Object.fromEntries(
              APPROVAL_ACTION_REFS.map(
                (actionName) => [
                  actionName,
                  () => {
                    effects.add(actionName);
                  },
                ],
              ),
            ) as ApprovalActionImplementations;

          const actor =
            createApprovalActor({
              context: {
                submittedBy:
                  approvalCase.submittedBy,

                proposedChange,
              },

              definition,

              separationOfDutiesCheck: (
                submittedBy,
                actorUserId,
              ) => submittedBy !== actorUserId,

              ...(ruleGatePassed ===
              undefined
                ? {}
                : {
                    ruleGateCheck:
                      () =>
                        ruleGatePassed,
                  }),

              actions,

              snapshot:
                approvalCase.xstateContextSnapshot as unknown as ApprovalMachineSnapshot,
            }).start();

          const before =
            actor.getSnapshot().value;

          actor.send(input.event);

          const after =
            actor.getSnapshot().value;

          if (before === after) {
            throw new GovernanceIllegalTransitionError(
              approvalCase.id,
              String(before),
              input.event.type,
            );
          }

          const persisted =
            actor.getPersistedSnapshot();

          const updated =
            await tx.approvalCase.update({
              where: {
                id: approvalCase.id,
              },

              data: {
                currentState:
                  stateValueToPrisma(after),

                xstateContextSnapshot:
                  toJson(persisted),
              },
            });

          if (
            effects.has("recordDecision")
          ) {
            if (
              input.event.type !== "APPROVE" &&
              input.event.type !== "REJECT"
            ) {
              throw new Error(
                "recordDecision action executed for a non-decision event",
              );
            }

            await tx.decisionLogEntry.create({
              data: {
                caseId: approvalCase.id,

                decision:
                  input.event.type === "APPROVE"
                    ? ApprovalDecision.APPROVED
                    : ApprovalDecision.REJECTED,

                decidedBy:
                  input.event.actorUserId,

                rationale:
                  input.event.rationale ?? null,
              },
            });
          }

          if (
            effects.has("recordChangesRequested")
          ) {
            if (
              input.event.type !== "REQUEST_CHANGES"
            ) {
              throw new Error(
                "recordChangesRequested action executed for a non-request-changes event",
              );
            }

            await tx.decisionLogEntry.create({
              data: {
                caseId: approvalCase.id,

                decision:
                  ApprovalDecision.CHANGES_REQUESTED,

                decidedBy:
                  input.event.actorUserId,

                rationale:
                  input.event.rationale ?? null,
              },
            });
          }

          if (
            effects.has(
              "scheduleEscalation",
            )
          ) {
            if (
              !approvalCase
                .approvalParticipantId
            ) {
              throw new Error(
                "Approval case has no assigned approval participant.",
              );
            }

            const deadline =
              new Date(
                Date.now() +
                  approvalCase
                    .approvalSlaMs,
              );

            const payload:
              GovernanceApprovalPendingPayload = {
                approvalCaseId:
                  approvalCase.id,

                entityType:
                  approvalCase.entityType,

                entityId:
                  approvalCase.entityId,

                participantUserId:
                  approvalCase
                    .approvalParticipantId,

                deadline:
                  deadline.toISOString(),
              };

            await this.eventBus.publishWithin(
              tx,
              [
                {
                  eventType:
                    GOVERNANCE_EVENT_TYPES
                      .approvalPending,

                  eventVersion:
                    GOVERNANCE_EVENT_VERSION,

                  aggregateType:
                    GOVERNANCE_AGGREGATE_TYPE,

                  aggregateId:
                    approvalCase.id,

                  dedupeKey:
                    governancePendingDedupeKey(
                      approvalCase.id,
                      deadline,
                    ),

                  payload,
                },
              ],
            );

            publishedEvent = true;
          }

          const eventType =
            effects.has(
              "emitApprovalGranted",
            )
              ? GOVERNANCE_EVENT_TYPES.approvalGranted
              : effects.has(
                    "emitApprovalRejected",
                  )
                ? GOVERNANCE_EVENT_TYPES.approvalRejected
                : null;

          if (eventType) {
            if (
              input.event.type !== "APPROVE" &&
              input.event.type !== "REJECT"
            ) {
              throw new Error(
                "Approval decision event emitted for a non-decision transition",
              );
            }

            const context =
              actor.getSnapshot().context;

            const payload: GovernanceDecisionPayload =
              {
                approvalCaseId:
                  approvalCase.id,

                entityType:
                  approvalCase.entityType,

                entityId:
                  approvalCase.entityId,

                submittedBy:
                  approvalCase.submittedBy,

                decidedBy:
                  input.event.actorUserId,

                rationale:
                  input.event.rationale ??
                  null,

                proposedChange:
                  context.proposedChange,
              };

            await this.eventBus.publishWithin(
              tx,
              [
                {
                  eventType,
                  eventVersion:
                    GOVERNANCE_EVENT_VERSION,

                  aggregateType:
                    GOVERNANCE_AGGREGATE_TYPE,

                  aggregateId:
                    approvalCase.id,

                  dedupeKey:
                    governanceDecisionDedupeKey(
                      eventType,
                      approvalCase.id,
                    ),

                  payload,
                },
              ],
            );

            publishedEvent = true;
          }

          return updated;
        },
      );

    if (publishedEvent) {
      await this.eventBus.nudgeRelay();
    }

    return result;
  }

  async getCase(caseId: string) {
    const result =
      await this.prisma.approvalCase.findUnique({
        where: {
          id: caseId,
        },

        include: {
          workflowDefinition: true,
          decisionLog: { orderBy: { decidedAt: "desc" } },
          escalations: true,
        },
      });

    if (!result) {
      throw new GovernanceCaseNotFoundError(
        caseId,
      );
    }

    return result;
  }

  async getLatestCaseForEntity(entityType: string, entityId: string) {
    return this.prisma.approvalCase.findFirst({
      where: { entityType, entityId },
      include: {
        workflowDefinition: true,
        decisionLog: { orderBy: { decidedAt: "desc" } },
        escalations: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Smallest read-only view over the real, persisted decision history:
   * DecisionLogEntry rows joined back to their case's entity for display,
   * no parallel governance subsystem. Most recent decisions first, capped
   * to keep the Governance screen's Decision Log tab bounded.
   */
  async listDecisions(limit = 50) {
    const entries = await this.prisma.decisionLogEntry.findMany({
      take: limit,
      orderBy: { decidedAt: "desc" },
      include: {
        approvalCase: {
          select: { entityType: true, entityId: true },
        },
      },
    });

    return entries.map((entry) => ({
      id: entry.id,
      caseId: entry.caseId,
      entityType: entry.approvalCase.entityType,
      entityId: entry.approvalCase.entityId,
      decision: entry.decision,
      decidedBy: entry.decidedBy,
      decidedAt: entry.decidedAt,
      rationale: entry.rationale,
    }));
  }

  async myPendingApprovals(
    viewerUserId: string,
  ) {
    return this.prisma.approvalCase.findMany({
      where: {
        currentState:
          ApprovalCaseState.PENDING_APPROVAL,

        approvalParticipantId:
          viewerUserId,

        submittedBy: {
          not: viewerUserId,
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async assertApproved(
    input: ApprovalReferenceInput,
  ): Promise<void> {
    const approvalCase =
      await this.prisma.approvalCase.findUnique({
        where: {
          id: input.approvalCaseId,
        },
      });

    if (!approvalCase) {
      throw new GovernanceApprovalReferenceError(
        `Approval case ${input.approvalCaseId} does not exist.`,
      );
    }

    if (
      approvalCase.currentState !==
      ApprovalCaseState.APPROVED
    ) {
      throw new GovernanceApprovalReferenceError(
        `Approval case ${input.approvalCaseId} is not approved.`,
      );
    }

    if (
      approvalCase.entityType !==
        input.entityType ||
      approvalCase.entityId !==
        input.entityId
    ) {
      throw new GovernanceApprovalReferenceError(
        `Approval case ${input.approvalCaseId} governs a different entity.`,
      );
    }
  }
}

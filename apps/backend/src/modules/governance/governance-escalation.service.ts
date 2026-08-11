import {
  ApprovalCaseState,
} from "../../generated/prisma/client";

import type { PrismaService } from "../../database/prisma.service";
import type { EventBusService } from "../../events/event-bus.service";

import {
  GOVERNANCE_AGGREGATE_TYPE,
  GOVERNANCE_EVENT_TYPES,
  GOVERNANCE_EVENT_VERSION,
  governanceEscalationDedupeKey,
  type GovernanceEscalationRaisedPayload,
} from "./governance.events";

import {
  GovernanceEscalationNotFoundError,
  GovernanceEscalationParticipantError,
} from "./governance.errors";

export interface RaiseEscalationInput {
  approvalCaseId: string;
  participantUserId: string;
  deadline: string;
}

export class GovernanceEscalationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async raise(
    input: RaiseEscalationInput,
  ) {
    const deadline = new Date(input.deadline);

    if (Number.isNaN(deadline.getTime())) {
      throw new Error(
        "Governance escalation deadline is invalid.",
      );
    }

    let published = false;

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtext(${`governance.escalation:${input.approvalCaseId}`})
            )
          `;

          const approvalCase =
            await tx.approvalCase.findUnique({
              where: {
                id: input.approvalCaseId,
              },
            });

          /*
           * A delayed job may legitimately fire after the
           * approval has already been decided.
           *
           * In that case the timer is stale and is a no-op.
           */
          if (
            !approvalCase ||
            approvalCase.currentState !==
              ApprovalCaseState.PENDING_APPROVAL
          ) {
            return null;
          }

          const escalation =
            await tx.escalationCase.upsert({
              where: {
                caseId_participant_deadline: {
                  caseId:
                    input.approvalCaseId,

                  participant:
                    input.participantUserId,

                  deadline,
                },
              },

              create: {
                caseId:
                  input.approvalCaseId,

                participant:
                  input.participantUserId,

                deadline,
              },

              update: {},
            });

          const payload:
            GovernanceEscalationRaisedPayload = {
              escalationCaseId:
                escalation.id,

              approvalCaseId:
                approvalCase.id,

              participantUserId:
                input.participantUserId,

              deadline:
                deadline.toISOString(),
            };

          const count =
            await this.eventBus.publishWithin(
              tx,
              [
                {
                  eventType:
                    GOVERNANCE_EVENT_TYPES
                      .escalationRaised,

                  eventVersion:
                    GOVERNANCE_EVENT_VERSION,

                  aggregateType:
                    GOVERNANCE_AGGREGATE_TYPE,

                  aggregateId:
                    approvalCase.id,

                  dedupeKey:
                    governanceEscalationDedupeKey(
                      approvalCase.id,
                      input.participantUserId,
                      deadline,
                    ),

                  payload,
                },
              ],
            );

          published = count > 0;

          return escalation;
        },
      );

    if (published) {
      await this.eventBus.nudgeRelay();
    }

    return result;
  }

  async acknowledge(
    escalationId: string,
    actingUserId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${`governance.escalation-ack:${escalationId}`})
          )
        `;

        const escalation =
          await tx.escalationCase.findUnique({
            where: {
              id: escalationId,
            },
          });

        if (!escalation) {
          throw new GovernanceEscalationNotFoundError(
            escalationId,
          );
        }

        if (
          escalation.participant !==
          actingUserId
        ) {
          throw new GovernanceEscalationParticipantError();
        }

        if (
          escalation.acknowledgedAt !==
          null
        ) {
          return escalation;
        }

        return tx.escalationCase.update({
          where: {
            id: escalation.id,
          },

          data: {
            acknowledgedAt:
              new Date(),

            acknowledgedBy:
              actingUserId,
          },
        });
      },
    );
  }
}

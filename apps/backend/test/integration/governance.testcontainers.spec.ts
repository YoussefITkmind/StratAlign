import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { PrismaService } from "../../src/database/prisma.service";
import { EventBusService } from "../../src/events/event-bus.service";
import type { QueueService } from "../../src/queue/queue.service";
import { createLogger } from "../../src/logging/logger";

import { GovernanceService } from "../../src/modules/governance/governance.service";
import {
  GOVERNANCE_EVENT_TYPES,
} from "../../src/modules/governance/governance.events";

import {
  ApprovalCaseState,
  ApprovalDecision,
} from "../../src/generated/prisma/client";

function applyMigrations(
  databaseUrl: string,
): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve(
    "prisma/build/index.js",
  );

  execFileSync(
    process.execPath,
    [
      prismaCli,
      "migrate",
      "deploy",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
      },
      stdio: "pipe",
    },
  );
}

const noopQueueService = {
  enqueue: async () => undefined,
} as unknown as QueueService;

describe.sequential(
  "Governance workflow with PostgreSQL Testcontainers",
  () => {
    let postgres: Awaited<
      ReturnType<
        PostgreSqlContainer["start"]
      >
    >;

    let databaseUrl: string;
    let prisma: PrismaService;
    let eventBus: EventBusService;
    let governance: GovernanceService;

    let submitterId: string;
    let approverId: string;
    let otherUserId: string;

    beforeAll(async () => {
      postgres =
        await new PostgreSqlContainer(
          "postgres:17-alpine",
        )
          .withDatabase(
            "spm_governance_test",
          )
          .withUsername("spm_test")
          .withPassword(
            "spm_test_password",
          )
          .start();

      databaseUrl =
        postgres.getConnectionUri();

      applyMigrations(databaseUrl);

      prisma =
        new PrismaService(databaseUrl);

      await prisma.connect();

      const logger =
        createLogger("error");

      eventBus =
        new EventBusService(
          noopQueueService,
          logger.child("event-bus"),
        );

      governance =
        new GovernanceService(
          prisma,
          eventBus,
        );
    }, 180_000);

    afterAll(async () => {
      await prisma?.disconnect();
      await postgres?.stop();
    }, 60_000);

    beforeEach(async () => {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE
          "governance"."decision_log_entries",
          "governance"."escalation_cases",
          "governance"."approval_cases",
          "governance"."workflow_definitions",
          "public"."domain_events",
          "iam"."users"
        RESTART IDENTITY CASCADE`,
      );

      const [
        submitter,
        approver,
        other,
      ] = await Promise.all([
        prisma.user.create({
          data: {
            email:
              "workflow-submitter@example.test",
            displayName:
              "Workflow Submitter",
          },
        }),

        prisma.user.create({
          data: {
            email:
              "workflow-approver@example.test",
            displayName:
              "Workflow Approver",
          },
        }),

        prisma.user.create({
          data: {
            email:
              "workflow-other@example.test",
            displayName:
              "Other User",
          },
        }),
      ]);

      submitterId = submitter.id;
      approverId = approver.id;
      otherUserId = other.id;

      governance =
        new GovernanceService(
          prisma,
          eventBus,
        );
    });

    async function createCase() {
      return governance.createCase({
        entityType:
          "RuleDefinition",

        entityId:
          "rule-definition-123",

        submittedBy:
          submitterId,

        approvalParticipantId:
          approverId,

        approvalSlaMs:
          60_000,

        proposedChange: {
          before: {
            status: "draft",
          },

          after: {
            status: "published",
          },

          impactSummary: {
            affectedKpis: 2,
          },
        },
      });
    }

    async function submitCase(
      caseId: string,
    ) {
      return governance.transition({
        caseId,

        event: {
          type: "SUBMIT",
          actorUserId:
            submitterId,
        },
      });
    }

    it(
      "persists the versioned workflow definition and initial actor snapshot",
      async () => {
        const created =
          await createCase();

        expect(
          created.currentState,
        ).toBe(
          ApprovalCaseState.DRAFT,
        );

        const stored =
          await prisma.approvalCase.findUniqueOrThrow(
            {
              where: {
                id: created.id,
              },

              include: {
                workflowDefinition:
                  true,
              },
            },
          );

        expect(
          stored.workflowDefinition
            .workflowKey,
        ).toBe(
          "generic_approval",
        );

        expect(
          stored.workflowDefinition
            .version,
        ).toBe(1);

        expect(
          stored.xstateContextSnapshot,
        ).toMatchObject({
          value: "draft",

          context: {
            submittedBy:
              submitterId,

            proposedChange: {
              before: {
                status:
                  "draft",
              },

              after: {
                status:
                  "published",
              },
            },
          },
        });
      },
    );

    it(
      "rehydrates a pending case after a service restart and allows a different user to approve",
      async () => {
        const created =
          await createCase();

        await submitCase(
          created.id,
        );

        const pending =
          await prisma.approvalCase.findUniqueOrThrow(
            {
              where: {
                id: created.id,
              },
            },
          );

        expect(
          pending.currentState,
        ).toBe(
          ApprovalCaseState.PENDING_APPROVAL,
        );

        /*
         * Simulate the process/service restarting:
         * no actor is retained in memory.
         *
         * The new GovernanceService must load
         * WorkflowDefinition + persisted XState
         * snapshot from PostgreSQL and construct
         * a fresh actor.
         */
        const restartedGovernance =
          new GovernanceService(
            prisma,
            eventBus,
          );

        await restartedGovernance.transition(
          {
            caseId: created.id,

            event: {
              type: "APPROVE",
              actorUserId:
                approverId,

              rationale:
                "Reviewed and approved",
            },
          },
        );

        const persisted =
          await prisma.approvalCase.findUniqueOrThrow(
            {
              where: {
                id: created.id,
              },

              include: {
                decisionLog: true,
              },
            },
          );

        expect(
          persisted.currentState,
        ).toBe(
          ApprovalCaseState.APPROVED,
        );

        expect(
          persisted.decisionLog,
        ).toMatchObject({
          decision:
            ApprovalDecision.APPROVED,

          decidedBy:
            approverId,

          rationale:
            "Reviewed and approved",
        });

        const event =
          await prisma.domainEvent.findFirstOrThrow(
            {
              where: {
                eventType:
                  GOVERNANCE_EVENT_TYPES
                    .approvalGranted,

                aggregateId:
                  created.id,
              },
            },
          );

        expect(
          event.payload,
        ).toMatchObject({
          approvalCaseId:
            created.id,

          entityType:
            "RuleDefinition",

          entityId:
            "rule-definition-123",

          submittedBy:
            submitterId,

          decidedBy:
            approverId,

          rationale:
            "Reviewed and approved",

          proposedChange: {
            after: {
              status:
                "published",
            },
          },
        });
      },
    );

    it(
      "rejects self approval without partially writing a decision or approval event",
      async () => {
        const created =
          await createCase();

        await submitCase(
          created.id,
        );

        await expect(
          governance.transition({
            caseId: created.id,

            event: {
              type: "APPROVE",

              actorUserId:
                submitterId,

              rationale:
                "Trying to approve my own change",
            },
          }),
        ).rejects.toMatchObject({
          code:
            "SEPARATION_OF_DUTIES_VIOLATION",
        });

        const persisted =
          await prisma.approvalCase.findUniqueOrThrow(
            {
              where: {
                id: created.id,
              },
            },
          );

        expect(
          persisted.currentState,
        ).toBe(
          ApprovalCaseState.PENDING_APPROVAL,
        );

        expect(
          await prisma.decisionLogEntry.count(
            {
              where: {
                caseId:
                  created.id,
              },
            },
          ),
        ).toBe(0);

        expect(
          await prisma.domainEvent.count({
            where: {
              aggregateId:
                created.id,

              eventType:
                GOVERNANCE_EVENT_TYPES
                  .approvalGranted,
            },
          }),
        ).toBe(0);
      },
    );

    it(
      "records rejection rationale and emits the rejection event",
      async () => {
        const created =
          await createCase();

        await submitCase(
          created.id,
        );

        await governance.transition({
          caseId: created.id,

          event: {
            type: "REJECT",

            actorUserId:
              approverId,

            rationale:
              "Threshold evidence is insufficient",
          },
        });

        const decision =
          await prisma.decisionLogEntry.findUniqueOrThrow(
            {
              where: {
                caseId:
                  created.id,
              },
            },
          );

        expect(
          decision,
        ).toMatchObject({
          decision:
            ApprovalDecision.REJECTED,

          decidedBy:
            approverId,

          rationale:
            "Threshold evidence is insufficient",
        });

        expect(
          await prisma.domainEvent.count({
            where: {
              aggregateId:
                created.id,

              eventType:
                GOVERNANCE_EVENT_TYPES
                  .approvalRejected,
            },
          }),
        ).toBe(1);
      },
    );

    it(
      "accepts an approved reference only for the exact governed entity",
      async () => {
        const created =
          await createCase();

        await submitCase(
          created.id,
        );

        await governance.transition({
          caseId: created.id,

          event: {
            type: "APPROVE",

            actorUserId:
              otherUserId,
          },
        });

        await expect(
          governance.assertApproved({
            approvalCaseId:
              created.id,

            entityType:
              "RuleDefinition",

            entityId:
              "rule-definition-123",
          }),
        ).resolves.toBeUndefined();

        await expect(
          governance.assertApproved({
            approvalCaseId:
              created.id,

            entityType:
              "RuleDefinition",

            entityId:
              "different-rule",
          }),
        ).rejects.toMatchObject({
          code:
            "GOVERNANCE_APPROVAL_REFERENCE_INVALID",
        });
      },
    );
  },
);

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import {
  GenericContainer,
  type StartedTestContainer,
} from "testcontainers";

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
import type { DomainEventEnvelope } from "../../src/events/event.types";

import { createLogger } from "../../src/logging/logger";

import { QueueConnectionProvider } from "../../src/queue/queue-connection";
import { QueueService } from "../../src/queue/queue.service";
import { WorkerFactory } from "../../src/queue/worker.factory";
import { DeadLetterService } from "../../src/queue/dead-letter.service";

import { GovernanceService } from "../../src/modules/governance/governance.service";
import { GovernanceEscalationService } from "../../src/modules/governance/governance-escalation.service";
import { GovernancePendingApprovalSubscriber } from "../../src/modules/governance/governance-pending.subscriber";

import {
  GOVERNANCE_EVENT_TYPES,
} from "../../src/modules/governance/governance.events";

import {
  createGovernanceEscalationWorker,
} from "../../src/workers/governance.workers";

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

async function waitFor<T>(
  read: () => Promise<T | null>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await read();

    if (value !== null) {
      return value;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 50),
    );
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms`,
  );
}

describe.sequential(
  "Governance BullMQ escalation with PostgreSQL and Redis Testcontainers",
  () => {
    let postgres: Awaited<
      ReturnType<PostgreSqlContainer["start"]>
    >;

    let redis: StartedTestContainer;

    let prisma: PrismaService;

    let queueService: QueueService;
    let workerFactory: WorkerFactory;

    let governance: GovernanceService;
    let escalationService: GovernanceEscalationService;
    let pendingSubscriber: GovernancePendingApprovalSubscriber;

    let submitterId: string;
    let approverId: string;

    beforeAll(async () => {
      postgres =
        await new PostgreSqlContainer(
          "postgres:17-alpine",
        )
          .withDatabase(
            "spm_governance_escalation_test",
          )
          .withUsername("spm_test")
          .withPassword(
            "spm_test_password",
          )
          .start();

      redis =
        await new GenericContainer(
          "redis:7-alpine",
        )
          .withExposedPorts(6379)
          .start();

      const databaseUrl =
        postgres.getConnectionUri();

      const redisUrl =
        `redis://${redis.getHost()}:${redis.getMappedPort(
          6379,
        )}`;

      applyMigrations(databaseUrl);

      prisma =
        new PrismaService(databaseUrl);

      await prisma.connect();

      const logger =
        createLogger("error");

      const connectionProvider =
        new QueueConnectionProvider(
          redisUrl,
        );

      queueService =
        new QueueService(
          connectionProvider,
          `governance-test-${Date.now()}`,
          logger.child("queue"),
        );

      const deadLetterService =
        new DeadLetterService(
          queueService,
          logger.child("dead-letter"),
        );

      workerFactory =
        new WorkerFactory(
          connectionProvider,
          `governance-test-${Date.now()}-worker`,
          deadLetterService,
          logger,
        );

      /*
       * Queue and worker MUST use the same BullMQ prefix.
       * Re-create them below with one shared prefix.
       */
      await queueService.close();

      const sharedPrefix =
        `governance-escalation-test-${Date.now()}`;

      queueService =
        new QueueService(
          connectionProvider,
          sharedPrefix,
          logger.child("queue"),
        );

      workerFactory =
        new WorkerFactory(
          connectionProvider,
          sharedPrefix,
          new DeadLetterService(
            queueService,
            logger.child("dead-letter"),
          ),
          logger,
        );

      const eventBus =
        new EventBusService(
          queueService,
          logger.child("event-bus"),
        );

      governance =
        new GovernanceService(
          prisma,
          eventBus,
        );

      escalationService =
        new GovernanceEscalationService(
          prisma,
          eventBus,
        );

      pendingSubscriber =
        new GovernancePendingApprovalSubscriber(
          queueService,
        );

      const worker =
        workerFactory.create(
          createGovernanceEscalationWorker(
            escalationService,
            1,
          ),
        );

      await worker.waitUntilReady();
    }, 180_000);

    afterAll(async () => {
      await workerFactory?.closeAll();
      await queueService?.close();
      await prisma?.disconnect();
      await redis?.stop();
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
      ] = await Promise.all([
        prisma.user.create({
          data: {
            email:
              `submitter-${Date.now()}@example.test`,
            displayName:
              "Governance Submitter",
          },
        }),

        prisma.user.create({
          data: {
            email:
              `approver-${Date.now()}@example.test`,
            displayName:
              "Governance Approver",
          },
        }),
      ]);

      submitterId =
        submitter.id;

      approverId =
        approver.id;
    });

    async function dispatchPendingEvent(
      approvalCaseId: string,
    ): Promise<void> {
      const pendingEvent =
        await prisma.domainEvent.findFirstOrThrow(
          {
            where: {
              aggregateId:
                approvalCaseId,

              eventType:
                GOVERNANCE_EVENT_TYPES
                  .approvalPending,
            },

            orderBy: {
              createdAt: "desc",
            },
          },
        );

      const envelope:
        DomainEventEnvelope = {
          eventId:
            pendingEvent.id,

          eventType:
            pendingEvent.eventType,

          eventVersion:
            pendingEvent.eventVersion,

          aggregateType:
            pendingEvent.aggregateType,

          aggregateId:
            pendingEvent.aggregateId,

          occurredAt:
            pendingEvent.occurredAt.toISOString(),

          payload:
            pendingEvent.payload as unknown as Record<
              string,
              unknown
            >,
        };

      await pendingSubscriber.handle(
        envelope,
      );
    }

    async function createAndSubmit(
      approvalSlaMs: number,
    ) {
      const approvalCase =
        await governance.createCase({
          entityType:
            "RuleDefinition",

          entityId:
            `rule-${Date.now()}`,

          submittedBy:
            submitterId,

          approvalParticipantId:
            approverId,

          approvalSlaMs,

          proposedChange: {
            before: {
              status: "draft",
            },

            after: {
              status: "published",
            },
          },
        });

      await governance.transition({
        caseId:
          approvalCase.id,

        event: {
          type: "SUBMIT",

          actorUserId:
            submitterId,
        },
      });

      return approvalCase;
    }

    it(
      "raises and acknowledges an escalation after the approval SLA expires",
      async () => {
        const approvalCase =
          await createAndSubmit(
            500,
          );

        /*
         * This represents normal outbox dispatch:
         *
         * approval.pending
         *       ↓
         * GovernancePendingApprovalSubscriber
         *       ↓
         * delayed BullMQ job
         */
        await dispatchPendingEvent(
          approvalCase.id,
        );

        /*
         * BullMQ must NOT execute this immediately.
         */
        expect(
          await prisma.escalationCase.count(
            {
              where: {
                caseId:
                  approvalCase.id,
              },
            },
          ),
        ).toBe(0);

        const escalation =
          await waitFor(
            () =>
              prisma.escalationCase.findFirst(
                {
                  where: {
                    caseId:
                      approvalCase.id,
                  },
                },
              ),
          );

        expect(
          escalation.participant,
        ).toBe(
          approverId,
        );

        expect(
          escalation.acknowledgedAt,
        ).toBeNull();

        const raisedEvent =
          await prisma.domainEvent.findFirstOrThrow(
            {
              where: {
                aggregateId:
                  approvalCase.id,

                eventType:
                  GOVERNANCE_EVENT_TYPES
                    .escalationRaised,
              },
            },
          );

        expect(
          raisedEvent.payload,
        ).toMatchObject({
          escalationCaseId:
            escalation.id,

          approvalCaseId:
            approvalCase.id,

          participantUserId:
            approverId,
        });

        const acknowledged =
          await escalationService.acknowledge(
            escalation.id,
            approverId,
          );

        expect(
          acknowledged.acknowledgedAt,
        ).not.toBeNull();

        expect(
          acknowledged.acknowledgedBy,
        ).toBe(
          approverId,
        );
      },
      20_000,
    );

    it(
      "does not raise a stale escalation when the approval was decided before the SLA deadline",
      async () => {
        const approvalCase =
          await createAndSubmit(
            800,
          );

        await dispatchPendingEvent(
          approvalCase.id,
        );

        await governance.transition({
          caseId:
            approvalCase.id,

          event: {
            type: "APPROVE",

            actorUserId:
              approverId,

            rationale:
              "Approved before escalation deadline",
          },
        });

        await new Promise((resolve) =>
          setTimeout(
            resolve,
            1_500,
          ),
        );

        expect(
          await prisma.escalationCase.count(
            {
              where: {
                caseId:
                  approvalCase.id,
              },
            },
          ),
        ).toBe(0);

        expect(
          await prisma.domainEvent.count({
            where: {
              aggregateId:
                approvalCase.id,

              eventType:
                GOVERNANCE_EVENT_TYPES
                  .escalationRaised,
            },
          }),
        ).toBe(0);
      },
      20_000,
    );

    it(
      "only allows the assigned participant to acknowledge an escalation",
      async () => {
        const approvalCase =
          await createAndSubmit(
            300,
          );

        await dispatchPendingEvent(
          approvalCase.id,
        );

        const escalation =
          await waitFor(
            () =>
              prisma.escalationCase.findFirst(
                {
                  where: {
                    caseId:
                      approvalCase.id,
                  },
                },
              ),
          );

        await expect(
          escalationService.acknowledge(
            escalation.id,
            submitterId,
          ),
        ).rejects.toMatchObject({
          code:
            "GOVERNANCE_ESCALATION_PARTICIPANT_MISMATCH",
        });

        const stored =
          await prisma.escalationCase.findUniqueOrThrow(
            {
              where: {
                id:
                  escalation.id,
              },
            },
          );

        expect(
          stored.acknowledgedAt,
        ).toBeNull();
      },
      20_000,
    );
  },
);

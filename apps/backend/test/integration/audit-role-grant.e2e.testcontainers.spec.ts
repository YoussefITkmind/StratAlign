import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer } from "@testcontainers/redis";
import { appRouter } from "@spm/api";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PrismaService } from "../../src/database/prisma.service";
import { IamAdminService } from "../../src/modules/iam/iam-admin.service";
import { SnapshotService } from "../../src/modules/audit/snapshot.service";
import { JournalService } from "../../src/modules/audit/journal.service";
import { ApiAuditTapService } from "../../src/modules/audit/api-audit-tap.service";
import { AuditEventSubscriber } from "../../src/modules/audit/audit-event.subscriber";
import { StubSiemForwarder } from "../../src/modules/audit/siem-forwarder";

import { createLogger } from "../../src/logging/logger";
import { QueueConnectionProvider } from "../../src/queue/queue-connection";
import { QueueService } from "../../src/queue/queue.service";
import { DeadLetterService } from "../../src/queue/dead-letter.service";
import { WorkerFactory } from "../../src/queue/worker.factory";

import { EventBusService } from "../../src/events/event-bus.service";
import { EventSubscriberRegistry } from "../../src/events/event-subscriber.registry";
import { EventDispatcherService } from "../../src/events/event-dispatcher.service";
import { OutboxRelayService } from "../../src/events/outbox-relay.service";

import {
  createEventDispatchWorker,
  createOutboxRelayWorker,
} from "../../src/workers/event.workers";

const execFileAsync = promisify(execFile);

describe.sequential(
  "role grant audit end-to-end",
  () => {
    let postgres:
      Awaited<ReturnType<PostgreSqlContainer["start"]>>;

    let redis:
      Awaited<ReturnType<RedisContainer["start"]>>;

    let prisma: PrismaService;
    let queueService: QueueService;
    let workerFactory: WorkerFactory;

    let iam: IamAdminService;
    let audit: SnapshotService;
    let auditTap: ApiAuditTapService;

    let administratorId: string;

    beforeAll(async () => {
      [postgres, redis] = await Promise.all([
        new PostgreSqlContainer("postgres:17-alpine")
          .withDatabase("spm_audit_e2e")
          .withUsername("spm_test")
          .withPassword("spm_test_password")
          .start(),

        new RedisContainer("redis:7-alpine")
          .start(),
      ]);

      const databaseUrl =
        postgres.getConnectionUri();

      await execFileAsync(
        "pnpm",
        [
          "exec",
          "prisma",
          "migrate",
          "deploy",
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
          },
        },
      );

      await execFileAsync(
        "pnpm",
        [
          "exec",
          "prisma",
          "db",
          "seed",
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            SEED_TEST_USER_PASSWORD:
              "AuditE2ETestPassword123!",
          },
        },
      );

      prisma = new PrismaService(databaseUrl);
      await prisma.connect();

      const administrator =
        await prisma.user.findUniqueOrThrow({
          where: {
            email: "bob@example.test",
          },
        });

      administratorId = administrator.id;

      const logger = createLogger(
        "error",
        "audit-role-grant-e2e",
      );

      const connectionProvider =
        new QueueConnectionProvider(
          redis.getConnectionUrl(),
        );

      queueService = new QueueService(
        connectionProvider,
        `spm-audit-e2e-${Date.now()}`,
        logger.child("queue"),
      );

      const deadLetterService =
        new DeadLetterService(
          queueService,
          logger.child("dead-letter"),
        );

      workerFactory = new WorkerFactory(
        connectionProvider,
        `spm-audit-e2e-${Date.now()}`,
        deadLetterService,
        logger.child("workers"),
      );

      /*
       * QueueService and WorkerFactory must use the same
       * BullMQ prefix. Recreate them with one shared prefix.
       */
      await queueService.close();

      const prefix =
        `spm-audit-e2e-${Date.now()}`;

      queueService = new QueueService(
        connectionProvider,
        prefix,
        logger.child("queue"),
      );

      const sharedDeadLetter =
        new DeadLetterService(
          queueService,
          logger.child("dead-letter"),
        );

      workerFactory = new WorkerFactory(
        connectionProvider,
        prefix,
        sharedDeadLetter,
        logger.child("workers"),
      );

      const registry =
        new EventSubscriberRegistry();

      const journal =
        new JournalService(prisma);

      const siem =
        new StubSiemForwarder(
          logger.child("siem"),
        );

      registry.register(
        new AuditEventSubscriber(
          journal,
          siem,
          logger.child("audit-journal"),
        ),
      );

      const dispatcher =
        new EventDispatcherService(
          registry,
          logger.child("dispatcher"),
        );

      const relay =
        new OutboxRelayService(
          prisma,
          queueService,
          registry,
          100,
          logger.child("relay"),
        );

      workerFactory.create(
        createOutboxRelayWorker(relay),
      );

      workerFactory.create(
        createEventDispatchWorker(
          dispatcher,
          2,
        ),
      );

      const eventBus =
        new EventBusService(
          queueService,
          logger.child("event-bus"),
        );

      auditTap =
        new ApiAuditTapService(
          prisma,
          eventBus,
        );

      iam =
        new IamAdminService(prisma);

      audit =
        new SnapshotService(prisma);
    }, 120_000);

    afterAll(async () => {
      await workerFactory?.closeAll();
      await queueService?.close();
      await prisma?.disconnect();

      await Promise.allSettled([
        postgres?.stop(),
        redis?.stop(),
      ]);
    }, 60_000);

    function caller() {
      const now = new Date();

      return appRouter.createCaller({
        health: {
          check: vi.fn(),
        },

        credentials: {
          authenticate: vi.fn(),
        },

        loginRateLimiter: {
          consume: vi.fn(),
          reset: vi.fn(),
        },

        clientIp: "127.0.0.1",

        session: {
          user: {
            id: administratorId,
            email: "bob@example.test",
            name: "Audit Administrator",
          },
          authenticatedAt: now,
          sessionId:
            "33333333-3333-4333-8333-333333333333",
          expiresAt:
            new Date(now.getTime() + 900_000),
          authenticationMethod:
            "credentials" as const,
        },

        oidcIdentities: {
          reconcile: vi.fn(),
        },

        authenticationFreshness: {
          record: vi.fn(),
        },

        authorization: {
          resolve: vi.fn().mockResolvedValue({
            userId: administratorId,
            roles: [
              "platform_administrator",
            ],
            scopeGrants: [],
            authenticatedAt: now,
          }),
        },

        iam,
        audit,
        auditTap,

        rules: {} as never,
      } as never);
    }

    async function waitForAuditEntry():
      Promise<void> {
      const deadline = Date.now() + 15_000;

      while (Date.now() < deadline) {
        const entry =
          await prisma.journalEntry.findFirst({
            where: {
              eventType:
                "spm.api.call.completed",
              aggregateType:
                "api_procedure",
              aggregateId:
                "iam.grantScope",
            },
          });

        if (entry) {
          return;
        }

        await delay(100);
      }

      throw new Error(
        "Timed out waiting for role-grant audit entry",
      );
    }

    it(
      "journals a real IAM role grant and exposes it through the audit API",
      async () => {
        const api = caller();

        const grant =
          await api.iam.grantScope({
            userEmail:
              "alice@example.test",
            roleName:
              "kpi_owner",
            orgScopeType:
              "sector",
            orgScopeId:
              "audit-e2e",
          });

        expect(grant.userId)
          .toBeTruthy();

        await waitForAuditEntry();

        const outbox =
          await prisma.domainEvent.findFirst({
            where: {
              eventType:
                "spm.api.call.completed",
              aggregateId:
                "iam.grantScope",
            },
          });

        expect(outbox).not.toBeNull();
        expect(outbox?.status)
          .toBe("PUBLISHED");

        const entries =
          await api.audit.listEntries({
            eventType:
              "spm.api.call.completed",
            aggregateType:
              "api_procedure",
            aggregateId:
              "iam.grantScope",
            limit: 10,
          });

        expect(entries)
          .toHaveLength(1);

        expect(entries[0])
          .toMatchObject({
            eventType:
              "spm.api.call.completed",
            aggregateType:
              "api_procedure",
            aggregateId:
              "iam.grantScope",
            actorUserId:
              administratorId,
          });

        expect(entries[0]?.sourceEventId)
          .toBe(outbox?.id);

        expect(entries[0]?.payload)
          .toMatchObject({
            procedurePath:
              "iam.grantScope",
            procedureType:
              "mutation",
            actorUserId:
              administratorId,
          });

        const persistedGrant =
          await prisma.scopeGrant.findUnique({
            where: {
              id: grant.id,
            },
          });

        expect(persistedGrant)
          .not.toBeNull();
      },
      30_000,
    );
  },
);

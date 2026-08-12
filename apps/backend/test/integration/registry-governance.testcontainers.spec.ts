import {
  execFileSync,
} from "node:child_process";

import {
  createRequire,
} from "node:module";

import {
  randomUUID,
} from "node:crypto";

import {
  PostgreSqlContainer,
} from "@testcontainers/postgresql";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  PrismaService,
} from "../../src/database/prisma.service";

import {
  EventBusService,
} from "../../src/events/event-bus.service";

import {
  createLogger,
} from "../../src/logging/logger";

import type {
  QueueService,
} from "../../src/queue/queue.service";

import {
  GovernanceService,
} from "../../src/modules/governance/governance.service";

import {
  GovernanceApprovalGateway,
} from "../../src/modules/registry/gateways/approval.gateway";

import {
  KpiRegistryService,
} from "../../src/modules/registry/kpi-registry.service";

import {
  RegistryApprovalError,
} from "../../src/modules/registry/registry.errors";

import {
  FakeStrategyNodeGateway,
} from "./support/registry-fakes";

function applyMigrations(
  databaseUrl: string,
): void {
  const require =
    createRequire(import.meta.url);

  execFileSync(
    process.execPath,
    [
      require.resolve(
        "prisma/build/index.js",
      ),
      "migrate",
      "deploy",
    ],
    {
      cwd: process.cwd(),

      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL:
          databaseUrl,
      },

      stdio: "pipe",
    },
  );
}

describe.sequential(
  "Registry publication with real Governance approval",
  () => {
    let postgres:
      Awaited<
        ReturnType<
          PostgreSqlContainer["start"]
        >
      >;

    let prisma:
      PrismaService;

    let governance:
      GovernanceService;

    let registry:
      KpiRegistryService;

    let submitterId:
      string;

    let approverId:
      string;

    beforeAll(
      async () => {
        postgres =
          await new PostgreSqlContainer(
            "postgres:17-alpine",
          )
            .withDatabase(
              "spm_registry_governance_test",
            )
            .withUsername(
              "spm_test",
            )
            .withPassword(
              "spm_test_password",
            )
            .start();

        const databaseUrl =
          postgres.getConnectionUri();

        applyMigrations(
          databaseUrl,
        );

        prisma =
          new PrismaService(
            databaseUrl,
          );

        await prisma.connect();

        const noopQueueService = {
          enqueue:
            async () =>
              undefined,
        } as unknown as QueueService;

        const eventBus =
          new EventBusService(
            noopQueueService,
            createLogger(
              "error",
            ).child(
              "event-bus",
            ),
          );

        governance =
          new GovernanceService(
            prisma,
            eventBus,
          );

        const approvalGateway =
          new GovernanceApprovalGateway(
            governance,
          );

        registry =
          new KpiRegistryService(
            prisma,
            approvalGateway,
            new FakeStrategyNodeGateway(),
          );

        const submitter =
          await prisma.user.create({
            data: {
              email:
                `registry-governance-submitter-${randomUUID()}@example.test`,

              displayName:
                "Registry Submitter",
            },
          });

        const approver =
          await prisma.user.create({
            data: {
              email:
                `registry-governance-approver-${randomUUID()}@example.test`,

              displayName:
                "Registry Approver",
            },
          });

        submitterId =
          submitter.id;

        approverId =
          approver.id;
      },
      180_000,
    );

    afterAll(
      async () => {
        await prisma?.disconnect();
        await postgres?.stop();
      },
      60_000,
    );

    beforeEach(
      async () => {
        await prisma.$executeRawUnsafe(
          `TRUNCATE TABLE
            "governance"."decision_log_entries",
            "governance"."escalation_cases",
            "governance"."approval_cases",
            "governance"."workflow_definitions",
            "registry"."kpi_hierarchy_nodes",
            "registry"."alignments",
            "registry"."key_results",
            "registry"."okrs",
            "registry"."kpi_versions",
            "registry"."kpi_definitions",
            "public"."domain_events"
          RESTART IDENTITY CASCADE`,
        );
      },
    );

    async function createDraft(
      name:
        string = "Governed KPI",
    ) {
      return registry.createDraft({
        nameEn:
          name,

        nameAr:
          "مؤشر خاضع للحوكمة",

        descriptionEn:
          "KPI governed by ApprovalCase",

        descriptionAr:
          "مؤشر أداء يخضع لحالة اعتماد",

        unit:
          "%",

        polarity:
          "higher_is_better",

        frequency:
          "monthly",

        dataSourceType:
          "manual",

        ownerUserId:
          submitterId,

        activeFrom:
          new Date(
            "2026-01-01T00:00:00.000Z",
          ),
      });
    }

    async function createApprovalCase(
      entityId: string,
    ) {
      return governance.createCase({
        entityType:
          "KpiDefinition",

        entityId,

        submittedBy:
          submitterId,

        approvalParticipantId:
          approverId,

        approvalSlaMs:
          60_000,

        proposedChange: {
          before: {
            status:
              "draft",
          },

          after: {
            status:
              "published",
          },

          impactSummary: {
            domain:
              "registry",
          },
        },
      });
    }

    async function approveCase(
      caseId: string,
    ) {
      await governance.transition({
        caseId,

        event: {
          type:
            "SUBMIT",

          actorUserId:
            submitterId,
        },
      });

      return governance.transition({
        caseId,

        event: {
          type:
            "APPROVE",

          actorUserId:
            approverId,

          rationale:
            "Approved for publication",
        },
      });
    }

    it(
      "publishes a KPI only after a different user approves the exact KPI definition",
      async () => {
        const draft =
          await createDraft();

        const approvalCase =
          await createApprovalCase(
            draft.definition.id,
          );

        /*
         * A DRAFT approval case must not authorize
         * publication.
         */
        await expect(
          registry.publishVersion({
            kpiVersionId:
              draft.version.id,

            approvalCaseId:
              approvalCase.id,
          }),
        ).rejects.toBeInstanceOf(
          RegistryApprovalError,
        );

        const approved =
          await approveCase(
            approvalCase.id,
          );

        expect(
          approved.currentState,
        ).toBe(
          "APPROVED",
        );

        expect(
          approved.submittedBy,
        ).toBe(
          submitterId,
        );

        const published =
          await registry.publishVersion({
            kpiVersionId:
              draft.version.id,

            approvalCaseId:
              approvalCase.id,
          });

        expect(
          published.definition.status,
        ).toBe(
          "active",
        );

        expect(
          published.version
            .publishedAt,
        ).not.toBeNull();

        expect(
          published.version
            .approvalCaseId,
        ).toBe(
          approvalCase.id,
        );

        const decision =
          await prisma
            .decisionLogEntry
            .findFirstOrThrow({
              where: {
                caseId:
                  approvalCase.id,
              },
            });

        expect(
          decision.decidedBy,
        ).toBe(
          approverId,
        );
      },
    );

    it(
      "refuses an approved case that governs a different KPI",
      async () => {
        const draft =
          await createDraft(
            "Exact entity protection KPI",
          );

        const wrongEntityId =
          randomUUID();

        const approvalCase =
          await createApprovalCase(
            wrongEntityId,
          );

        await approveCase(
          approvalCase.id,
        );

        await expect(
          registry.publishVersion({
            kpiVersionId:
              draft.version.id,

            approvalCaseId:
              approvalCase.id,
          }),
        ).rejects.toBeInstanceOf(
          RegistryApprovalError,
        );

        const stored =
          await prisma.kpiVersion
            .findUniqueOrThrow({
              where: {
                id:
                  draft.version.id,
              },
            });

        expect(
          stored.publishedAt,
        ).toBeNull();

        const definition =
          await prisma.kpiDefinition
            .findUniqueOrThrow({
              where: {
                id:
                  draft.definition.id,
              },
            });

        expect(
          definition.status,
        ).toBe(
          "DRAFT",
        );

        expect(
          definition.activeVersionId,
        ).toBeNull();
      },
    );
  },
);

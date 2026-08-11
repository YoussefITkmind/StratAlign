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
  vi,
} from "vitest";

import {
  appRouter,
  type TrpcContext,
} from "@spm/api";

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
  RulesService,
} from "../../src/modules/rules/rules.service";

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
  "rules.publish with real Governance approval",
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

    let rules:
      RulesService;

    let publisherId:
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
              "spm_rules_governance_test",
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
              "rules-governance-event-bus",
            ),
          );

        rules =
          new RulesService(
            prisma,
          );

        governance =
          new GovernanceService(
            prisma,
            eventBus,
            rules,
          );

        const publisher =
          await prisma.user.create({
            data: {
              email:
                `rules-publisher-${randomUUID()}@example.test`,

              displayName:
                "Rule Publisher",
            },
          });

        const approver =
          await prisma.user.create({
            data: {
              email:
                `rules-approver-${randomUUID()}@example.test`,

              displayName:
                "Rule Approver",
            },
          });

        publisherId =
          publisher.id;

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
            "rules"."rule_definitions",
            "public"."domain_events"
          RESTART IDENTITY CASCADE`,
        );
      },
    );

    function createContext():
      TrpcContext {
      return {
        session: {
          user: {
            id:
              publisherId,

            email:
              "rules-publisher@example.test",

            name:
              "Rule Publisher",
          },

          authenticatedAt:
            new Date(),

          sessionId:
            `rules-governance-${randomUUID()}`,

          expiresAt:
            new Date(
              Date.now() +
                60 * 60 * 1000,
            ),

          authenticationMethod:
            "credentials",
        },

        authorization: {
          resolve:
            async () => ({
              userId:
                publisherId,

              roles: [
                "seo_administrator",
              ],

              scopeGrants:
                [],

              authenticatedAt:
                new Date(),
            }),
        },

        governance,

        rules,

        auditTap: {
          recordCompletedCall:
            vi.fn(
              async () =>
                undefined,
            ),
        },
      } as unknown as TrpcContext;
    }

    async function createCase(
      ruleId: string,
    ) {
      return governance.createCase({
        entityType:
          "RuleDefinition",

        entityId:
          ruleId,

        submittedBy:
          publisherId,

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
              "rules",
          },
        },
      });
    }

    it(
      "blocks rejected publication then allows publication after a different user approves the exact rule",
      async () => {
        const draft =
          await rules.createDraft({
            ruleKey:
              "governed-revenue-threshold",

            name:
              "Governed Revenue Threshold",

            createdBy:
              publisherId,

            document: {
              ruleType:
                "threshold_status",

              direction:
                "higher_is_better",

              bands: [
                {
                  label:
                    "On track",

                  color:
                    "green",

                  comparator:
                    "gte",

                  value:
                    90,
                },

                {
                  label:
                    "Off track",

                  color:
                    "red",

                  comparator:
                    "lt",

                  value:
                    90,
                },
              ],
            },
          });

        expect(
          draft.status,
        ).toBe(
          "draft",
        );

        const caller =
          appRouter.createCaller(
            createContext(),
          );

        /*
         * First workflow:
         * submit -> reject.
         */
        const rejectedCase =
          await createCase(
            draft.id,
          );

        await governance.transition({
          caseId:
            rejectedCase.id,

          event: {
            type:
              "SUBMIT",

            actorUserId:
              publisherId,
          },
        });

        const rejected =
          await governance.transition({
            caseId:
              rejectedCase.id,

            event: {
              type:
                "REJECT",

              actorUserId:
                approverId,

              rationale:
                "Threshold requires revision",
          },
        });

        expect(
          rejected.currentState,
        ).toBe(
          "REJECTED",
        );

        /*
         * A rejected case must never authorize
         * rules.publish.
         */
        await expect(
          caller.rules.publish({
            ruleId:
              draft.id,

            approvalCaseId:
              rejectedCase.id,
          }),
        ).rejects.toMatchObject({
          code:
            "FORBIDDEN",
        });

        const stillDraft =
          await prisma
            .ruleDefinition
            .findUniqueOrThrow({
              where: {
                id:
                  draft.id,
              },
            });

        expect(
          stillDraft.status,
        ).toBe(
          "DRAFT",
        );

        /*
         * Rejected is terminal in this workflow,
         * therefore a fresh ApprovalCase is opened
         * for the same RuleDefinition.
         */
        const approvedCase =
          await createCase(
            draft.id,
          );

        await governance.transition({
          caseId:
            approvedCase.id,

          event: {
            type:
              "SUBMIT",

            actorUserId:
              publisherId,
          },
        });

        const approved =
          await governance.transition({
            caseId:
              approvedCase.id,

          event: {
              type:
                "APPROVE",

              actorUserId:
                approverId,

              rationale:
                "Reviewed and approved",
            },
        });

        expect(
          approved.currentState,
        ).toBe(
          "APPROVED",
        );

        expect(
          approverId,
        ).not.toBe(
          publisherId,
        );

        /*
         * This call now passes through the real
         * withWorkflowReferenceCheck middleware,
         * then reaches the real RulesService.
         */
        const published =
          await caller.rules.publish({
            ruleId:
              draft.id,

            approvalCaseId:
              approvedCase.id,
          });

        expect(
          published.status,
        ).toBe(
          "published",
        );

        expect(
          published.id,
        ).toBe(
          draft.id,
        );

        expect(
          published.publishedAt,
        ).not.toBeNull();

        /*
         * Both terminal decisions must be recorded
         * against the two ApprovalCases.
         */
        const decisions =
          await prisma
            .decisionLogEntry
            .findMany({
              where: {
                caseId: {
                  in: [
                    rejectedCase.id,
                    approvedCase.id,
                  ],
                },
              },

              orderBy: {
                decidedAt:
                  "asc",
              },
            });

        expect(
          decisions,
        ).toHaveLength(
          2,
        );

        expect(
          decisions.map(
            (entry) =>
              entry.decision,
          ),
        ).toEqual([
          "REJECTED",
          "APPROVED",
        ]);

        expect(
          decisions.every(
            (entry) =>
              entry.decidedBy ===
              approverId,
          ),
        ).toBe(
          true,
        );
      },
    );
  },
);

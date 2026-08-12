import {
  execFileSync,
} from "node:child_process";

import {
  createRequire,
} from "node:module";

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
  DEFAULT_APPROVAL_WORKFLOW_DEFINITION,
} from "@spm/machines";

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
  GovernanceIllegalTransitionError,
} from "../../src/modules/governance/governance.errors";

import {
  RulesService,
} from "../../src/modules/rules/rules.service";

function applyMigrations(
  databaseUrl: string,
): void {
  const require =
    createRequire(import.meta.url);

  const prismaCli =
    require.resolve(
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
        DATABASE_URL:
          databaseUrl,
      },

      stdio: "pipe",
    },
  );
}

describe.sequential(
  "Governance rule-backed workflow guard",
  () => {
    let postgres:
      Awaited<
        ReturnType<
          PostgreSqlContainer["start"]
        >
      >;

    let prisma:
      PrismaService;

    let rules:
      RulesService;

    let governance:
      GovernanceService;

    let submitterId:
      string;

    let approverId:
      string;

    let ruleId:
      string;

    const workflowKey =
      "rule_guard_workflow";

    beforeAll(
      async () => {
        postgres =
          await new PostgreSqlContainer(
            "postgres:17-alpine",
          )
            .withDatabase(
              "spm_governance_rule_guard_test",
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

        const logger =
          createLogger("error");

        const eventBus =
          new EventBusService(
            noopQueueService,
            logger.child(
              "event-bus",
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
            "public"."domain_events",
            "rules"."rule_definitions",
            "iam"."users"
          RESTART IDENTITY CASCADE`,
        );

        const submitter =
          await prisma.user.create({
            data: {
              email:
                "rule-guard-submitter@example.test",

              displayName:
                "Rule Guard Submitter",
            },
          });

        const approver =
          await prisma.user.create({
            data: {
              email:
                "rule-guard-approver@example.test",

              displayName:
                "Rule Guard Approver",
            },
          });

        submitterId =
          submitter.id;

        approverId =
          approver.id;

        const draft =
          await rules.createDraft({
            ruleKey:
              "governance-approval-gate",

            name:
              "Governance approval gate",

            createdBy:
              submitterId,

            document: {
              ruleType:
                "gate_criteria",

              criteria: [
                {
                  name:
                    "Change approved",

                  fact:
                    "approved",

                  operator:
                    "equals",

                  expected:
                    true,
                },
              ],
            },
          });

        const published =
          await rules.publish(
            draft.id,
          );

        ruleId =
          published.id;

        const definition =
          structuredClone(
            DEFAULT_APPROVAL_WORKFLOW_DEFINITION,
          );

        definition.key =
          workflowKey;

        definition.states
          .pending_approval
          .on!.APPROVE!.guard = {
            type:
              "ruleGate",

            ruleId,

            inputSource:
              "proposedChange.after",
          };

        await prisma.workflowDefinition.create(
          {
            data: {
              workflowKey,
              version: 1,
              definitionJson:
                definition,

              isCurrent:
                true,
            },
          },
        );
      },
    );

    async function createCase(
      approved: boolean,
    ) {
      const created =
        await governance.createCase(
          {
            workflowKey,

            entityType:
              "RuleDefinition",

            entityId:
              `entity-${approved}`,

            submittedBy:
              submitterId,

            approvalParticipantId:
              approverId,

            proposedChange: {
              before: {
                facts: {
                  approved:
                    false,
                },
              },

              after: {
                facts: {
                  approved,
                },
              },
            },
          },
        );

      await governance.transition(
        {
          caseId:
            created.id,

          event: {
            type:
              "SUBMIT",

            actorUserId:
              submitterId,
          },
        },
      );

      return created;
    }

    it(
      "allows approval when the configured published gate rule passes",
      async () => {
        const created =
          await createCase(
            true,
          );

        const approved =
          await governance.transition(
            {
              caseId:
                created.id,

              event: {
                type:
                  "APPROVE",

                actorUserId:
                  approverId,

                rationale:
                  "Gate passed",
              },
            },
          );

        expect(
          approved.currentState,
        ).toBe(
          "APPROVED",
        );
      },
    );

    it(
      "blocks approval when the configured published gate rule fails",
      async () => {
        const created =
          await createCase(
            false,
          );

        await expect(
          governance.transition({
            caseId:
              created.id,

            event: {
              type:
                "APPROVE",

              actorUserId:
                approverId,
            },
          }),
        ).rejects.toBeInstanceOf(
          GovernanceIllegalTransitionError,
        );

        const stored =
          await prisma.approvalCase
            .findUniqueOrThrow({
              where: {
                id:
                  created.id,
              },
            });

        expect(
          stored.currentState,
        ).toBe(
          "PENDING_APPROVAL",
        );

        expect(
          await prisma
            .decisionLogEntry
            .count({
              where: {
                caseId:
                  created.id,
              },
            }),
        ).toBe(0);
      },
    );
  },
);

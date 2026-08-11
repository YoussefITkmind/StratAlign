import "dotenv/config";

import {
  PrismaPg,
} from "@prisma/adapter-pg";

import {
  PrismaClient,
} from "../src/generated/prisma/client";

import {
  DEFAULT_APPROVAL_WORKFLOW_DEFINITION,
  createApprovalActor,
} from "@spm/machines";

const connectionString =
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required",
  );
}

const prisma =
  new PrismaClient({
    adapter:
      new PrismaPg({
        connectionString,
      }),
  });

const APPROVER_CASE_ID =
  "70000000-0000-4000-8000-000000000001";

const OWN_CASE_ID =
  "70000000-0000-4000-8000-000000000002";

function toJson(
  value: unknown,
) {
  return JSON.parse(
    JSON.stringify(value),
  );
}

function pendingSnapshot(
  submittedBy: string,
  before: unknown,
  after: unknown,
) {
  const actor =
    createApprovalActor({
      context: {
        submittedBy,

        proposedChange: {
          before,
          after,
        },
      },

      definition:
        DEFAULT_APPROVAL_WORKFLOW_DEFINITION,

      separationOfDutiesCheck:
        (
          submitter,
          actorUserId,
        ) =>
          submitter !==
          actorUserId,
    }).start();

  actor.send({
    type:
      "SUBMIT",

    actorUserId:
      submittedBy,
  });

  const snapshot =
    toJson(
      actor.getPersistedSnapshot(),
    );

  actor.stop();

  return snapshot;
}

async function main() {
  const adminEmail =
    process.env.E2E_ADMIN_EMAIL ??
    "bob@example.test";

  const memberEmail =
    process.env.E2E_MEMBER_EMAIL ??
    "alice@example.test";

  const approver =
    await prisma.user
      .findUniqueOrThrow({
        where: {
          email:
            adminEmail,
        },
      });

  const submitter =
    await prisma.user
      .findUniqueOrThrow({
        where: {
          email:
            memberEmail,
        },
      });

  const definition =
    DEFAULT_APPROVAL_WORKFLOW_DEFINITION;

  const workflow =
    await prisma
      .workflowDefinition
      .upsert({
        where: {
          workflowKey_version: {
            workflowKey:
              definition.key,

            version:
              definition.version,
          },
        },

        update: {
          definitionJson:
            toJson(
              definition,
            ),

          isCurrent:
            true,
        },

        create: {
          workflowKey:
            definition.key,

          version:
            definition.version,

          definitionJson:
            toJson(
              definition,
            ),

          isCurrent:
            true,
        },
      });

  const fixtureCaseIds = [
    APPROVER_CASE_ID,
    OWN_CASE_ID,
  ];

  /*
   * Reset only deterministic E2E fixtures.
   * Do not truncate unrelated Governance data.
   */
  await prisma
    .decisionLogEntry
    .deleteMany({
      where: {
        caseId: {
          in:
            fixtureCaseIds,
        },
      },
    });

  await prisma
    .escalationCase
    .deleteMany({
      where: {
        caseId: {
          in:
            fixtureCaseIds,
        },
      },
    });

  await prisma
    .approvalCase
    .deleteMany({
      where: {
        id: {
          in:
            fixtureCaseIds,
        },
      },
    });

  /*
   * Real pending case:
   *
   * Alice submits.
   * Bob is assigned as approver.
   */
  await prisma
    .approvalCase
    .create({
      data: {
        id:
          APPROVER_CASE_ID,

        workflowDefinitionId:
          workflow.id,

        entityType:
          "GroupRoleMapping",

        entityId:
          "stratalign-analysts",

        submittedBy:
          submitter.id,

        approvalParticipantId:
          approver.id,

        approvalSlaMs:
          86_400_000,

        currentState:
          "PENDING_APPROVAL",

        xstateContextSnapshot:
          pendingSnapshot(
            submitter.id,
            {
              group:
                "stratalign-analysts",

              role:
                "member",
            },
            {
              group:
                "stratalign-analysts",

              role:
                "platform_administrator",
            },
          ),
      },
    });

  /*
   * Separation-of-duties fixture:
   *
   * Bob submitted it himself and Bob
   * is also the assigned participant.
   *
   * It must therefore be hidden from
   * myPendingApprovals and impossible
   * for Bob to approve directly.
   */
  await prisma
    .approvalCase
    .create({
      data: {
        id:
          OWN_CASE_ID,

        workflowDefinitionId:
          workflow.id,

        entityType:
          "RoleGrant",

        entityId:
          "self-role-grant",

        submittedBy:
          approver.id,

        approvalParticipantId:
          approver.id,

        approvalSlaMs:
          86_400_000,

        currentState:
          "PENDING_APPROVAL",

        xstateContextSnapshot:
          pendingSnapshot(
            approver.id,
            {
              role:
                "member",
            },
            {
              role:
                "platform_administrator",
            },
          ),
      },
    });

  console.log(
    "Governance E2E fixtures seeded",
  );
}

main()
  .catch(
    (error: unknown) => {
      console.error(
        "Governance E2E seed failed",
        error,
      );

      process.exitCode =
        1;
    },
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    },
  );

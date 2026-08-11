import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  appRouter,
  type TrpcContext,
} from "./index";

const USER_ID =
  "11111111-1111-4111-8111-111111111111";

const RULE_ID =
  "22222222-2222-4222-8222-222222222222";

const APPROVAL_CASE_ID =
  "33333333-3333-4333-8333-333333333333";

const createdAt =
  new Date("2026-08-11T12:00:00.000Z");

const publishedRule = {
  id: RULE_ID,
  ruleKey: "revenue-threshold",
  ruleType:
    "threshold_status" as const,
  name: "Revenue threshold",

  document: {
    ruleType:
      "threshold_status" as const,

    direction:
      "higher_is_better" as const,

    bands: [
      {
        label: "on_track",
        color: "green",
        comparator: "gte" as const,
        value: 80,
      },

      {
        label: "off_track",
        color: "red",
        comparator: "lt" as const,
        value: 80,
      },
    ],
  },

  version: 1,
  status: "published" as const,
  isCurrent: true,
  publishedAt: createdAt,
  supersedesId: null,
  createdAt,
  createdBy: USER_ID,
};

function createContext(
  assertApproved: (
    input: {
      approvalCaseId: string;
      entityType: string;
      entityId: string;
    },
  ) => Promise<void>,
) {
  const rulesPublish = vi.fn(
    async () => publishedRule,
  );

  const auditTap = vi.fn(
    async () => undefined,
  );

  const context = {
    session: {
      user: {
        id: USER_ID,
        email:
          "publisher@example.test",
        name:
          "Rule Publisher",
      },

      authenticatedAt:
        new Date(),

      sessionId:
        "workflow-test-session",

      expiresAt:
        new Date(
          Date.now() +
            60 * 60 * 1000,
        ),

      authenticationMethod:
        "credentials" as const,
    },

    authorization: {
      resolve: async () => ({
        userId: USER_ID,

        roles: [
          "seo_administrator" as const,
        ],

        scopeGrants: [],

        authenticatedAt:
          new Date(),
      }),
    },

    governance: {
      assertApproved,
    },

    rules: {
      publish:
        rulesPublish,
    },

    auditTap: {
      recordCompletedCall:
        auditTap,
    },
  } as unknown as TrpcContext;

  return {
    context,
    rulesPublish,
    auditTap,
  };
}

describe(
  "withWorkflowReferenceCheck",
  () => {
    it(
      "allows rules.publish only when the approval case governs the same RuleDefinition",
      async () => {
        const assertApproved =
          vi.fn(
            async () =>
              undefined,
          );

        const {
          context,
          rulesPublish,
        } =
          createContext(
            assertApproved,
          );

        const caller =
          appRouter.createCaller(
            context,
          );

        const result =
          await caller.rules.publish({
            ruleId:
              RULE_ID,

            approvalCaseId:
              APPROVAL_CASE_ID,
          });

        expect(
          result.status,
        ).toBe("published");

        expect(
          assertApproved,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          assertApproved,
        ).toHaveBeenCalledWith({
          approvalCaseId:
            APPROVAL_CASE_ID,

          entityType:
            "RuleDefinition",

          entityId:
            RULE_ID,
        });

        expect(
          rulesPublish,
        ).toHaveBeenCalledWith(
          RULE_ID,
        );
      },
    );

    it(
      "fails closed and never publishes when the workflow reference is not approved for the entity",
      async () => {
        const assertApproved =
          vi.fn(
            async () => {
              throw new Error(
                "approval reference rejected",
              );
            },
          );

        const {
          context,
          rulesPublish,
        } =
          createContext(
            assertApproved,
          );

        const caller =
          appRouter.createCaller(
            context,
          );

        await expect(
          caller.rules.publish({
            ruleId:
              RULE_ID,

            approvalCaseId:
              APPROVAL_CASE_ID,
          }),
        ).rejects.toMatchObject({
          code: "FORBIDDEN",
        });

        expect(
          rulesPublish,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

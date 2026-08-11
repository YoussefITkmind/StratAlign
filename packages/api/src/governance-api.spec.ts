import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  appRouter,
  type GovernanceCaseOutput,
  type TrpcContext,
} from "./index";

const USER_ID =
  "11111111-1111-4111-8111-111111111111";

const CASE_ID =
  "22222222-2222-4222-8222-222222222222";

const WORKFLOW_ID =
  "33333333-3333-4333-8333-333333333333";

const caseOutput:
  GovernanceCaseOutput = {
    id: CASE_ID,

    workflowDefinitionId:
      WORKFLOW_ID,

    entityType:
      "RuleDefinition",

    entityId:
      "rule-definition-123",

    submittedBy:
      "44444444-4444-4444-8444-444444444444",

    approvalParticipantId:
      USER_ID,

    approvalSlaMs:
      86_400_000,

    currentState:
      "PENDING_APPROVAL",

    xstateContextSnapshot: {
      value:
        "pending_approval",
    },

    createdAt:
      new Date(
        "2026-08-11T12:00:00.000Z",
      ),

    updatedAt:
      new Date(
        "2026-08-11T12:01:00.000Z",
      ),
  };

function createContext() {
  const myPendingApprovals =
    vi.fn(
      async () => [
        caseOutput,
      ],
    );

  const getCase =
    vi.fn(
      async () =>
        caseOutput,
    );

  const transition =
    vi.fn(
      async () => ({
        ...caseOutput,

        currentState:
          "APPROVED" as const,
      }),
    );

  const auditTap =
    vi.fn(
      async () =>
        undefined,
    );

  const context = {
    session: {
      user: {
        id:
          USER_ID,

        email:
          "approver@example.test",

        name:
          "Approver",
      },

      authenticatedAt:
        new Date(),

      sessionId:
        "governance-api-test",

      expiresAt:
        new Date(
          Date.now() +
            60 * 60 * 1000,
        ),

      authenticationMethod:
        "credentials" as const,
    },

    governance: {
      assertApproved:
        async () =>
          undefined,

      myPendingApprovals,

      getCase,

      transition,
    },

    auditTap: {
      recordCompletedCall:
        auditTap,
    },
  } as unknown as TrpcContext;

  return {
    context,
    myPendingApprovals,
    getCase,
    transition,
    auditTap,
  };
}

describe(
  "governance API",
  () => {
    it(
      "returns the authenticated user's pending approvals",
      async () => {
        const {
          context,
          myPendingApprovals,
        } =
          createContext();

        const caller =
          appRouter.createCaller(
            context,
          );

        const result =
          await caller
            .governance
            .myPendingApprovals();

        expect(
          result,
        ).toEqual([
          caseOutput,
        ]);

        expect(
          myPendingApprovals,
        ).toHaveBeenCalledWith(
          USER_ID,
        );
      },
    );

    it(
      "loads an approval case",
      async () => {
        const {
          context,
          getCase,
        } =
          createContext();

        const caller =
          appRouter.createCaller(
            context,
          );

        const result =
          await caller
            .governance
            .getCase({
              caseId:
                CASE_ID,
            });

        expect(
          result,
        ).toEqual(
          caseOutput,
        );

        expect(
          getCase,
        ).toHaveBeenCalledWith(
          CASE_ID,
        );
      },
    );

    it(
      "maps an approve decision to the XState APPROVE event using the authenticated actor",
      async () => {
        const {
          context,
          transition,
          auditTap,
        } =
          createContext();

        const caller =
          appRouter.createCaller(
            context,
          );

        const result =
          await caller
            .governance
            .decide({
              caseId:
                CASE_ID,

              decision:
                "approve",

              rationale:
                "Reviewed and approved",
            });

        expect(
          result.currentState,
        ).toBe(
          "APPROVED",
        );

        expect(
          transition,
        ).toHaveBeenCalledWith({
          caseId:
            CASE_ID,

          event: {
            type:
              "APPROVE",

            actorUserId:
              USER_ID,

            rationale:
              "Reviewed and approved",
          },
        });

        /*
         * Mutations remain part of the
         * normal tRPC audit tap.
         */
        expect(
          auditTap,
        ).toHaveBeenCalled();
      },
    );

    it(
      "maps request_changes to the machine REQUEST_CHANGES event",
      async () => {
        const {
          context,
          transition,
        } =
          createContext();

        const caller =
          appRouter.createCaller(
            context,
          );

        await caller
          .governance
          .decide({
            caseId:
              CASE_ID,

            decision:
              "request_changes",

            rationale:
              "Please attach evidence",
          });

        expect(
          transition,
        ).toHaveBeenCalledWith({
          caseId:
            CASE_ID,

          event: {
            type:
              "REQUEST_CHANGES",

            actorUserId:
              USER_ID,

            rationale:
              "Please attach evidence",
          },
        });
      },
    );
  },
);

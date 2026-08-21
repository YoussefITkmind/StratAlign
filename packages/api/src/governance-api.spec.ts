import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  appRouter,
  type GovernanceCaseOutput,
  type GovernanceEscalationOutput,
  type GovernanceEscalationListOutput,
  type TrpcContext,
} from "./index";

const USER_ID =
  "11111111-1111-4111-8111-111111111111";

const CASE_ID =
  "22222222-2222-4222-8222-222222222222";

const WORKFLOW_ID =
  "33333333-3333-4333-8333-333333333333";

const ESCALATION_ID =
  "55555555-5555-4555-8555-555555555555";

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

const escalationOutput:
  GovernanceEscalationOutput = {
    id:
      ESCALATION_ID,

    caseId:
      CASE_ID,

    participant:
      USER_ID,

    deadline:
      new Date(
        "2026-08-11T13:00:00.000Z",
      ),

    acknowledgedAt:
      new Date(
        "2026-08-11T13:05:00.000Z",
      ),

    acknowledgedBy:
      USER_ID,

    createdAt:
      new Date(
        "2026-08-11T13:00:01.000Z",
      ),
  };

const escalationListOutput: GovernanceEscalationListOutput = {
  ...escalationOutput,
  approvalCase: {
    id: CASE_ID,
    entityType: "RuleDefinition",
    entityId: "rule-definition-123",
    currentState: "PENDING_APPROVAL",
    approvalSlaMs: 86_400_000,
  },
  participantUser: { id: USER_ID, displayName: "Approver", email: "approver@example.test" },
  acknowledger: { id: USER_ID, displayName: "Approver", email: "approver@example.test" },
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

  const getLatestCaseForEntity = vi.fn(async () => caseOutput);
  const submitCase = vi.fn(async () => caseOutput);

  const transition =
    vi.fn(
      async () => ({
        ...caseOutput,

        currentState:
          "APPROVED" as const,
      }),
    );

  const acknowledgeEscalation =
    vi.fn(
      async () =>
        escalationOutput,
    );
  const listEscalations = vi.fn(async () => [escalationListOutput]);

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

      getLatestCaseForEntity,

      submitCase,

      transition,
    },

    governanceEscalation: {
      listForParticipant: listEscalations,
      acknowledge:
        acknowledgeEscalation,
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
    getLatestCaseForEntity,
    submitCase,
    transition,
    acknowledgeEscalation,
    listEscalations,
    auditTap,
  };
}

describe(
  "governance API",
  () => {
    it("lists persisted escalations for the authenticated participant", async () => {
      const { context, listEscalations } = createContext();
      const caller = appRouter.createCaller(context);
      await expect(caller.governance.escalation.list({ includeAcknowledged: false }))
        .resolves.toEqual([escalationListOutput]);
      expect(listEscalations).toHaveBeenCalledWith(USER_ID, false);
    });
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

    it("submits a real case using the authenticated user as submitter", async () => {
      const { context, submitCase } = createContext();
      const caller = appRouter.createCaller(context);
      await caller.governance.submit({
        entityType: "RuleDefinition",
        entityId: CASE_ID,
        approvalParticipantId: USER_ID,
        proposedChange: { before: {}, after: { version: 2 } },
      });
      expect(submitCase).toHaveBeenCalledWith(expect.objectContaining({
        entityType: "RuleDefinition", entityId: CASE_ID, submittedBy: USER_ID,
      }));
    });

    it("reloads the latest persisted approval state for an entity", async () => {
      const { context, getLatestCaseForEntity } = createContext();
      const caller = appRouter.createCaller(context);
      await expect(caller.governance.getLatestCaseForEntity({
        entityType: "RuleDefinition", entityId: CASE_ID,
      })).resolves.toEqual(caseOutput);
      expect(getLatestCaseForEntity).toHaveBeenCalledWith("RuleDefinition", CASE_ID);
    });

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

    it(
      "acknowledges an escalation as the authenticated participant",
      async () => {
        const {
          context,
          acknowledgeEscalation,
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
            .escalation
            .acknowledge({
              escalationId:
                ESCALATION_ID,
            });

        expect(
          result,
        ).toEqual(
          escalationOutput,
        );

        expect(
          acknowledgeEscalation,
        ).toHaveBeenCalledWith(
          ESCALATION_ID,
          USER_ID,
        );

        /*
         * The actor id is injected from
         * the authenticated session.
         */
        expect(
          result.acknowledgedBy,
        ).toBe(
          USER_ID,
        );

        /*
         * Acknowledgement is a mutation,
         * therefore it remains audit-tapped.
         */
        expect(
          auditTap,
        ).toHaveBeenCalled();
      },
    );

    it(
      "maps an escalation participant mismatch to FORBIDDEN",
      async () => {
        const {
          context,
          acknowledgeEscalation,
        } =
          createContext();

        acknowledgeEscalation
          .mockRejectedValueOnce({
            code:
              "GOVERNANCE_ESCALATION_PARTICIPANT_MISMATCH",

            message:
              "Only the assigned escalation participant can acknowledge this escalation.",
          });

        const caller =
          appRouter.createCaller(
            context,
          );

        await expect(
          caller
            .governance
            .escalation
            .acknowledge({
              escalationId:
                ESCALATION_ID,
            }),
        ).rejects.toMatchObject({
          code:
            "FORBIDDEN",
        });

        expect(
          acknowledgeEscalation,
        ).toHaveBeenCalledWith(
          ESCALATION_ID,
          USER_ID,
        );
      },
    );

  },
);

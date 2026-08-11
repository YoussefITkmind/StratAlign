import { createActor, setup, type SnapshotFrom } from "xstate";
import { z } from "zod";

export const APPROVAL_STATES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "changes_requested",
] as const;

export const APPROVAL_EVENT_TYPES = [
  "SUBMIT",
  "APPROVE",
  "REJECT",
  "REQUEST_CHANGES",
  "RESUBMIT",
] as const;

export const APPROVAL_GUARD_REFS = [
  "separationOfDuties",
] as const;

export const APPROVAL_ACTION_REFS = [
  "recordSubmission",
  "recordDecision",
  "recordChangesRequested",
  "recordResubmission",
  "emitApprovalGranted",
  "emitApprovalRejected",
] as const;

export type ApprovalState = (typeof APPROVAL_STATES)[number];
export type ApprovalEventType = (typeof APPROVAL_EVENT_TYPES)[number];
export type ApprovalGuardRef = (typeof APPROVAL_GUARD_REFS)[number];
export type ApprovalActionRef = (typeof APPROVAL_ACTION_REFS)[number];

export interface ProposedChange {
  before: unknown;
  after: unknown;
  impactSummary?: unknown;
}

export interface ApprovalMachineContext {
  submittedBy: string;
  proposedChange: ProposedChange;
}

export type ApprovalMachineEvent =
  | { type: "SUBMIT"; actorUserId: string }
  | { type: "APPROVE"; actorUserId: string; rationale?: string }
  | { type: "REJECT"; actorUserId: string; rationale?: string }
  | {
      type: "REQUEST_CHANGES";
      actorUserId: string;
      rationale?: string;
    }
  | { type: "RESUBMIT"; actorUserId: string };

export const approvalTransitionDefinitionSchema = z.object({
  target: z.enum(APPROVAL_STATES),
  guard: z.enum(APPROVAL_GUARD_REFS).optional(),
  actions: z.array(z.enum(APPROVAL_ACTION_REFS)).default([]),
});

export const approvalStateDefinitionSchema = z.object({
  type: z.literal("final").optional(),
  on: z
    .partialRecord(
      z.enum(APPROVAL_EVENT_TYPES),
      approvalTransitionDefinitionSchema,
    )
    .optional(),
});

export const workflowMachineDefinitionSchema = z.object({
  key: z.string().trim().min(1),
  version: z.number().int().positive(),
  initial: z.enum(APPROVAL_STATES),
  states: z.record(
    z.enum(APPROVAL_STATES),
    approvalStateDefinitionSchema,
  ),
});

export type WorkflowMachineDefinition = z.infer<
  typeof workflowMachineDefinitionSchema
>;

export const DEFAULT_APPROVAL_WORKFLOW_DEFINITION: WorkflowMachineDefinition =
  workflowMachineDefinitionSchema.parse({
    key: "generic_approval",
    version: 1,
    initial: "draft",
    states: {
      draft: {
        on: {
          SUBMIT: {
            target: "pending_approval",
            actions: ["recordSubmission"],
          },
        },
      },

      pending_approval: {
        on: {
          APPROVE: {
            target: "approved",
            guard: "separationOfDuties",
            actions: [
              "recordDecision",
              "emitApprovalGranted",
            ],
          },
          REJECT: {
            target: "rejected",
            guard: "separationOfDuties",
            actions: [
              "recordDecision",
              "emitApprovalRejected",
            ],
          },
          REQUEST_CHANGES: {
            target: "changes_requested",
            actions: ["recordChangesRequested"],
          },
        },
      },

      approved: {
        type: "final",
      },

      rejected: {
        type: "final",
      },

      changes_requested: {
        on: {
          RESUBMIT: {
            target: "pending_approval",
            actions: ["recordResubmission"],
          },
        },
      },
    },
  });

export type SeparationOfDutiesCheck = (
  submittedBy: string,
  actorUserId: string,
) => boolean;

const approvalSetup = setup({
  types: {
    context: {} as ApprovalMachineContext,
    input: {} as ApprovalMachineContext,
    events: {} as ApprovalMachineEvent,
  },

  guards: {
    // Fail closed until the caller provides the real IAM-backed guard.
    separationOfDuties: () => false,
  },

  actions: {
    // These are semantic action references.
    // Persistence/outbox implementations are supplied by Governance.
    recordSubmission: () => undefined,
    recordDecision: () => undefined,
    recordChangesRequested: () => undefined,
    recordResubmission: () => undefined,
    emitApprovalGranted: () => undefined,
    emitApprovalRejected: () => undefined,
  },
});

const genericApprovalMachine = approvalSetup.createMachine({
  id: DEFAULT_APPROVAL_WORKFLOW_DEFINITION.key,
  initial: "draft",
  context: ({ input }) => input,

  states: {
    draft: {
      on: {
        SUBMIT: {
          target: "pending_approval",
          actions: "recordSubmission",
        },
      },
    },

    pending_approval: {
      on: {
        APPROVE: {
          target: "approved",
          guard: "separationOfDuties",
          actions: [
            "recordDecision",
            "emitApprovalGranted",
          ],
        },

        REJECT: {
          target: "rejected",
          guard: "separationOfDuties",
          actions: [
            "recordDecision",
            "emitApprovalRejected",
          ],
        },

        REQUEST_CHANGES: {
          target: "changes_requested",
          actions: "recordChangesRequested",
        },
      },
    },

    approved: {
      type: "final",
    },

    rejected: {
      type: "final",
    },

    changes_requested: {
      on: {
        RESUBMIT: {
          target: "pending_approval",
          actions: "recordResubmission",
        },
      },
    },
  },
});

export function createApprovalMachine(
  separationOfDutiesCheck: SeparationOfDutiesCheck,
) {
  return genericApprovalMachine.provide({
    guards: {
      separationOfDuties: ({ context, event }) => {
        if (
          event.type !== "APPROVE" &&
          event.type !== "REJECT"
        ) {
          return false;
        }

        return separationOfDutiesCheck(
          context.submittedBy,
          event.actorUserId,
        );
      },
    },
  });
}

export type ApprovalMachineSnapshot = SnapshotFrom<
  ReturnType<typeof createApprovalMachine>
>;

export function createApprovalActor(input: {
  context: ApprovalMachineContext;
  separationOfDutiesCheck: SeparationOfDutiesCheck;
  snapshot?: ApprovalMachineSnapshot;
}) {
  const machine = createApprovalMachine(
    input.separationOfDutiesCheck,
  );

  return createActor(machine, {
    input: input.context,
    ...(input.snapshot === undefined
      ? {}
      : { snapshot: input.snapshot }),
  });
}

import {
  createActor,
  setup,
  type SnapshotFrom,
} from "xstate";
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
  "scheduleEscalation",
  "emitApprovalGranted",
  "emitApprovalRejected",
] as const;

export type ApprovalState =
  (typeof APPROVAL_STATES)[number];

export type ApprovalEventType =
  (typeof APPROVAL_EVENT_TYPES)[number];

export type ApprovalGuardRef =
  (typeof APPROVAL_GUARD_REFS)[number];

export type ApprovalActionRef =
  (typeof APPROVAL_ACTION_REFS)[number];

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
  | {
      type: "SUBMIT";
      actorUserId: string;
    }
  | {
      type: "APPROVE";
      actorUserId: string;
      rationale?: string;
    }
  | {
      type: "REJECT";
      actorUserId: string;
      rationale?: string;
    }
  | {
      type: "REQUEST_CHANGES";
      actorUserId: string;
      rationale?: string;
    }
  | {
      type: "RESUBMIT";
      actorUserId: string;
    };

export const approvalTransitionDefinitionSchema =
  z.object({
    target: z.enum(APPROVAL_STATES),
    guard: z.enum(APPROVAL_GUARD_REFS).optional(),
    actions: z
      .array(z.enum(APPROVAL_ACTION_REFS))
      .default([]),
  });

export const approvalStateDefinitionSchema =
  z.object({
    type: z.literal("final").optional(),
    on: z
      .partialRecord(
        z.enum(APPROVAL_EVENT_TYPES),
        approvalTransitionDefinitionSchema,
      )
      .optional(),
  });

export const workflowMachineDefinitionSchema =
  z.object({
    key: z.string().trim().min(1),
    version: z.number().int().positive(),
    initial: z.enum(APPROVAL_STATES),

    states: z.record(
      z.enum(APPROVAL_STATES),
      approvalStateDefinitionSchema,
    ),
  });

export type WorkflowMachineDefinition =
  z.infer<
    typeof workflowMachineDefinitionSchema
  >;

export const DEFAULT_APPROVAL_WORKFLOW_DEFINITION =
  workflowMachineDefinitionSchema.parse({
    key: "generic_approval",
    version: 1,
    initial: "draft",

    states: {
      draft: {
        on: {
          SUBMIT: {
            target: "pending_approval",
            actions: [
              "recordSubmission",
              "scheduleEscalation",
            ],
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
            actions: [
              "recordChangesRequested",
            ],
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
            actions: [
              "recordResubmission",
              "scheduleEscalation",
            ],
          },
        },
      },
    },
  });

export type SeparationOfDutiesCheck = (
  submittedBy: string,
  actorUserId: string,
) => boolean;

export interface ApprovalActionArgs {
  context: ApprovalMachineContext;
  event: ApprovalMachineEvent;
}

export type ApprovalActionImplementation = (
  args: ApprovalActionArgs,
) => void;

export type ApprovalActionImplementations = Partial<
  Record<ApprovalActionRef, ApprovalActionImplementation>
>;

export function parseWorkflowDefinition(
  input: unknown,
): WorkflowMachineDefinition {
  return workflowMachineDefinitionSchema.parse(
    input,
  );
}

const approvalSetup = setup({
  types: {
    context:
      {} as ApprovalMachineContext,

    input:
      {} as ApprovalMachineContext,

    events:
      {} as ApprovalMachineEvent,
  },

  guards: {
    separationOfDuties: () => false,
  },

  actions: {
    recordSubmission: () => undefined,
    recordDecision: () => undefined,
    recordChangesRequested: () => undefined,
    recordResubmission: () => undefined,
    scheduleEscalation: () => undefined,
    emitApprovalGranted: () => undefined,
    emitApprovalRejected: () => undefined,
  },
});

function compileTransition(
  transition:
    | z.infer<
        typeof approvalTransitionDefinitionSchema
      >
    | undefined,
) {
  if (!transition) {
    return undefined;
  }

  return {
    target: transition.target,

    ...(transition.guard
      ? {
          guard: transition.guard,
        }
      : {}),

    ...(transition.actions.length > 0
      ? {
          actions: transition.actions,
        }
      : {}),
  };
}

function compactTransitions<
  T extends Record<
    string,
    ReturnType<typeof compileTransition>
  >,
>(transitions: T) {
  return Object.fromEntries(
    Object.entries(transitions).filter(
      ([, value]) => value !== undefined,
    ),
  );
}

export function createApprovalMachine(input: {
  definition:
    | WorkflowMachineDefinition
    | unknown;

  separationOfDutiesCheck:
    SeparationOfDutiesCheck;

  actions?: ApprovalActionImplementations;
}) {
  const definition =
    parseWorkflowDefinition(
      input.definition,
    );

  const draft =
    definition.states.draft;

  const pending =
    definition.states.pending_approval;

  const approved =
    definition.states.approved;

  const rejected =
    definition.states.rejected;

  const changesRequested =
    definition.states.changes_requested;

  const machine =
    approvalSetup.createMachine({
      id: definition.key,
      initial: definition.initial,

      context: ({ input: context }) =>
        context,

      states: {
        draft: {
          ...(draft.type === "final"
            ? {
                type: "final" as const,
              }
            : {}),

          on: compactTransitions({
            SUBMIT:
              compileTransition(
                draft.on?.SUBMIT,
              ),

            APPROVE:
              compileTransition(
                draft.on?.APPROVE,
              ),

            REJECT:
              compileTransition(
                draft.on?.REJECT,
              ),

            REQUEST_CHANGES:
              compileTransition(
                draft.on
                  ?.REQUEST_CHANGES,
              ),

            RESUBMIT:
              compileTransition(
                draft.on?.RESUBMIT,
              ),
          }),
        },

        pending_approval: {
          ...(pending.type === "final"
            ? {
                type: "final" as const,
              }
            : {}),

          on: compactTransitions({
            SUBMIT:
              compileTransition(
                pending.on?.SUBMIT,
              ),

            APPROVE:
              compileTransition(
                pending.on?.APPROVE,
              ),

            REJECT:
              compileTransition(
                pending.on?.REJECT,
              ),

            REQUEST_CHANGES:
              compileTransition(
                pending.on
                  ?.REQUEST_CHANGES,
              ),

            RESUBMIT:
              compileTransition(
                pending.on?.RESUBMIT,
              ),
          }),
        },

        approved: {
          ...(approved.type === "final"
            ? {
                type: "final" as const,
              }
            : {}),

          on: compactTransitions({
            SUBMIT:
              compileTransition(
                approved.on?.SUBMIT,
              ),

            APPROVE:
              compileTransition(
                approved.on?.APPROVE,
              ),

            REJECT:
              compileTransition(
                approved.on?.REJECT,
              ),

            REQUEST_CHANGES:
              compileTransition(
                approved.on
                  ?.REQUEST_CHANGES,
              ),

            RESUBMIT:
              compileTransition(
                approved.on?.RESUBMIT,
              ),
          }),
        },

        rejected: {
          ...(rejected.type === "final"
            ? {
                type: "final" as const,
              }
            : {}),

          on: compactTransitions({
            SUBMIT:
              compileTransition(
                rejected.on?.SUBMIT,
              ),

            APPROVE:
              compileTransition(
                rejected.on?.APPROVE,
              ),

            REJECT:
              compileTransition(
                rejected.on?.REJECT,
              ),

            REQUEST_CHANGES:
              compileTransition(
                rejected.on
                  ?.REQUEST_CHANGES,
              ),

            RESUBMIT:
              compileTransition(
                rejected.on?.RESUBMIT,
              ),
          }),
        },

        changes_requested: {
          ...(changesRequested.type ===
          "final"
            ? {
                type: "final" as const,
              }
            : {}),

          on: compactTransitions({
            SUBMIT:
              compileTransition(
                changesRequested.on
                  ?.SUBMIT,
              ),

            APPROVE:
              compileTransition(
                changesRequested.on
                  ?.APPROVE,
              ),

            REJECT:
              compileTransition(
                changesRequested.on
                  ?.REJECT,
              ),

            REQUEST_CHANGES:
              compileTransition(
                changesRequested.on
                  ?.REQUEST_CHANGES,
              ),

            RESUBMIT:
              compileTransition(
                changesRequested.on
                  ?.RESUBMIT,
              ),
          }),
        },
      },
    });

  return machine.provide({
    guards: {
      separationOfDuties: ({
        context,
        event,
      }) => {
        if (
          event.type !== "APPROVE" &&
          event.type !== "REJECT"
        ) {
          return false;
        }

        return input
          .separationOfDutiesCheck(
            context.submittedBy,
            event.actorUserId,
          );
      },
    },

    actions: {
      recordSubmission: ({ context, event }) =>
        input.actions?.recordSubmission?.({
          context,
          event,
        }),

      recordDecision: ({ context, event }) =>
        input.actions?.recordDecision?.({
          context,
          event,
        }),

      recordChangesRequested: ({ context, event }) =>
        input.actions?.recordChangesRequested?.({
          context,
          event,
        }),

      recordResubmission: ({ context, event }) =>
        input.actions?.recordResubmission?.({
          context,
          event,
        }),

      scheduleEscalation: ({ context, event }) =>
        input.actions?.scheduleEscalation?.({
          context,
          event,
        }),

      emitApprovalGranted: ({ context, event }) =>
        input.actions?.emitApprovalGranted?.({
          context,
          event,
        }),

      emitApprovalRejected: ({ context, event }) =>
        input.actions?.emitApprovalRejected?.({
          context,
          event,
        }),
    },
  });
}

export type ApprovalMachineSnapshot =
  SnapshotFrom<
    ReturnType<
      typeof createApprovalMachine
    >
  >;

export function createApprovalActor(input: {
  context: ApprovalMachineContext;

  separationOfDutiesCheck:
    SeparationOfDutiesCheck;

  definition?:
    | WorkflowMachineDefinition
    | unknown;

  actions?: ApprovalActionImplementations;

  snapshot?: ApprovalMachineSnapshot;
}) {
  const machine =
    createApprovalMachine({
      definition:
        input.definition ??
        DEFAULT_APPROVAL_WORKFLOW_DEFINITION,

      separationOfDutiesCheck:
        input.separationOfDutiesCheck,

      actions: input.actions,
    });

  return createActor(machine, {
    input: input.context,

    ...(input.snapshot === undefined
      ? {}
      : {
          snapshot: input.snapshot,
        }),
  });
}

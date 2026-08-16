import { assign, setup, type SnapshotFrom } from "xstate";

export const VALUE_LIFECYCLE_STATES = [
  "identification",
  "pending_approval",
  "approved",
  "validation",
  "tracking",
  "closure",
] as const;

export type ValueLifecycleState = (typeof VALUE_LIFECYCLE_STATES)[number];

export const VALUE_REALIZATION_WORKFLOW_DEFINITION = {
  key: "value_realization",
  version: 1,
  initial: "identification",
  states: {
    identification: {
      on: {
        SUBMIT_FOR_APPROVAL: { target: "pending_approval" },
      },
    },
    pending_approval: {
      subcase: "generic_approval",
      on: {
        APPROVAL_GRANTED: { target: "approved" },
      },
    },
    approved: {
      on: {
        BEGIN_VALIDATION: { target: "validation", guard: "baselineExists" },
      },
    },
    validation: {
      on: {
        START_TRACKING: { target: "tracking" },
      },
    },
    tracking: {
      on: {
        CLOSE: { target: "closure", guard: "realizedValueExists" },
      },
    },
    closure: { type: "final" },
  },
} as const;

export interface ValueLifecycleContext {
  benefitId: string;
  approvalCaseId: string | null;
  baselineExists: boolean;
  realizedEntryCount: number;
  stopReason: string | null;
}

export type ValueLifecycleEvent =
  | { type: "SUBMIT_FOR_APPROVAL"; approvalCaseId: string }
  | { type: "APPROVAL_GRANTED" }
  | { type: "BEGIN_VALIDATION" }
  | { type: "START_TRACKING" }
  | { type: "REFRESH_FACTS"; baselineExists: boolean; realizedEntryCount: number }
  | { type: "CLOSE"; stopReason?: string | null };

/**
 * Long-lived value-realization lifecycle for a Benefit.
 *
 * `pending_approval` deliberately composes the existing governance ApprovalCase
 * instead of duplicating its approval logic. The Benefit stores the ApprovalCase
 * id and this machine receives APPROVAL_GRANTED only after governance has
 * approved that sub-case, preserving the existing separation-of-duties,
 * decision log, SLA and escalation semantics.
 *
 * VALUE_REALIZATION_WORKFLOW_DEFINITION is persisted in the existing governance
 * WorkflowDefinition table by ValueService. The XState machine below is the
 * executable implementation of that definition.
 */
export const valueLifecycleMachine = setup({
  types: {
    context: {} as ValueLifecycleContext,
    input: {} as ValueLifecycleContext,
    events: {} as ValueLifecycleEvent,
  },
  guards: {
    baselineExists: ({ context }) => context.baselineExists,
    realizedValueExists: ({ context }) => context.realizedEntryCount > 0,
  },
  actions: {
    attachApprovalCase: assign({
      approvalCaseId: ({ event }) =>
        event.type === "SUBMIT_FOR_APPROVAL" ? event.approvalCaseId : null,
    }),
    refreshFacts: assign({
      baselineExists: ({ context, event }) =>
        event.type === "REFRESH_FACTS" ? event.baselineExists : context.baselineExists,
      realizedEntryCount: ({ context, event }) =>
        event.type === "REFRESH_FACTS" ? event.realizedEntryCount : context.realizedEntryCount,
    }),
    recordStopReason: assign({
      stopReason: ({ context, event }) =>
        event.type === "CLOSE" ? event.stopReason ?? null : context.stopReason,
    }),
  },
}).createMachine({
  id: "value-lifecycle",
  initial: VALUE_REALIZATION_WORKFLOW_DEFINITION.initial,
  context: ({ input }) => ({ ...input }),
  on: {
    REFRESH_FACTS: { actions: "refreshFacts" },
  },
  states: {
    identification: {
      on: {
        SUBMIT_FOR_APPROVAL: {
          target: "pending_approval",
          actions: "attachApprovalCase",
        },
      },
    },
    pending_approval: {
      on: {
        APPROVAL_GRANTED: { target: "approved" },
      },
    },
    approved: {
      on: {
        BEGIN_VALIDATION: {
          target: "validation",
          guard: "baselineExists",
        },
      },
    },
    validation: {
      on: {
        START_TRACKING: { target: "tracking" },
      },
    },
    tracking: {
      on: {
        CLOSE: {
          target: "closure",
          guard: "realizedValueExists",
          actions: "recordStopReason",
        },
      },
    },
    closure: { type: "final" },
  },
});

export type ValueLifecycleSnapshot = SnapshotFrom<typeof valueLifecycleMachine>;

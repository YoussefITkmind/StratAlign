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
        STOP: { target: "closure" },
      },
    },
    pending_approval: {
      subcase: "generic_approval",
      on: {
        APPROVAL_GRANTED: { target: "approved" },
        STOP: { target: "closure" },
      },
    },
    approved: {
      on: {
        BEGIN_VALIDATION: { target: "validation", guard: "baselineExists" },
        STOP: { target: "closure" },
      },
    },
    validation: {
      on: {
        START_TRACKING: { target: "tracking" },
        STOP: { target: "closure" },
      },
    },
    tracking: {
      on: {
        CLOSE: { target: "closure", guard: "realizedValueExists" },
        STOP: { target: "closure" },
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
  | { type: "CLOSE"; stopReason?: string | null }
  | { type: "STOP"; stopReason: string };

/**
 * Long-lived value-realization lifecycle for a Benefit.
 *
 * `pending_approval` deliberately composes the existing governance ApprovalCase
 * instead of duplicating its approval logic. The Benefit stores the ApprovalCase
 * id and this machine receives APPROVAL_GRANTED only after governance has
 * approved that sub-case, preserving the existing separation-of-duties,
 * decision log, SLA and escalation semantics.
 *
 * STOP is intentionally different from normal CLOSE: it is a committee-driven
 * terminal consequence of a Value Gate decision and therefore does not require
 * a realized entry. No public benefit workflow procedure emits STOP.
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
        event.type === "CLOSE" || event.type === "STOP"
          ? event.stopReason ?? null
          : context.stopReason,
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
        STOP: { target: "closure", actions: "recordStopReason" },
      },
    },
    pending_approval: {
      on: {
        APPROVAL_GRANTED: { target: "approved" },
        STOP: { target: "closure", actions: "recordStopReason" },
      },
    },
    approved: {
      on: {
        BEGIN_VALIDATION: {
          target: "validation",
          guard: "baselineExists",
        },
        STOP: { target: "closure", actions: "recordStopReason" },
      },
    },
    validation: {
      on: {
        START_TRACKING: { target: "tracking" },
        STOP: { target: "closure", actions: "recordStopReason" },
      },
    },
    tracking: {
      on: {
        CLOSE: {
          target: "closure",
          guard: "realizedValueExists",
          actions: "recordStopReason",
        },
        STOP: { target: "closure", actions: "recordStopReason" },
      },
    },
    closure: { type: "final" },
  },
});

export type ValueLifecycleSnapshot = SnapshotFrom<typeof valueLifecycleMachine>;

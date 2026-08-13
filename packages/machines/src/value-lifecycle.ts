import { setup, type SnapshotFrom } from "xstate";

export const VALUE_LIFECYCLE_STATES = [
  "identification",
  "pending_approval",
  "approved",
  "validation",
  "tracking",
  "closure",
] as const;

export type ValueLifecycleState = (typeof VALUE_LIFECYCLE_STATES)[number];

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
 * Deliberate composition decision: `pending_approval` does NOT reimplement the
 * Phase 1 generic approval machine. A Benefit stores the real ApprovalCase id
 * and this machine advances on APPROVAL_GRANTED only after the governance
 * workflow has approved that sub-case. This keeps separation-of-duties,
 * decision logging, rule guards and escalation in the existing approval engine.
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
    attachApprovalCase: ({ context, event }) => {
      if (event.type === "SUBMIT_FOR_APPROVAL") {
        context.approvalCaseId = event.approvalCaseId;
      }
    },
    refreshFacts: ({ context, event }) => {
      if (event.type === "REFRESH_FACTS") {
        context.baselineExists = event.baselineExists;
        context.realizedEntryCount = event.realizedEntryCount;
      }
    },
    recordStopReason: ({ context, event }) => {
      if (event.type === "CLOSE") context.stopReason = event.stopReason ?? null;
    },
  },
}).createMachine({
  id: "value-lifecycle",
  initial: "identification",
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

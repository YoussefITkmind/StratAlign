/**
 * Contract for the global, context-aware StratAlign AI assistant.
 *
 * Unlike theme suggestion generation, this surface is deliberately
 * module-agnostic: `module`/`moduleName`/`data` are opaque values supplied by
 * whichever frontend module currently has focus. Nothing here branches on a
 * specific module id, so a future module (Dashboards, Reports, ...) can start
 * sending its own context without any change to this file or the service that
 * consumes it — the frontend's context resolver is the only place that knows
 * about individual modules.
 */

/** A single entity the current module is focused on (a scorecard, a KPI, ...). */
export interface AssistantEntityRef {
  type: string;
  id: string;
  name: string;
}

/** A JSON-safe scalar. Bounded shapes only — never an arbitrary object graph. */
export type AssistantContextPrimitive = string | number | boolean | null;

/** A flat record of primitives — one KPI, one perspective, one initiative row. */
export type AssistantContextRow = Record<string, AssistantContextPrimitive>;

export type AssistantContextValue =
  | AssistantContextPrimitive
  | AssistantContextPrimitive[]
  | AssistantContextRow
  | AssistantContextRow[];

/**
 * What the frontend's active context provider supplies for the module the
 * user is currently viewing. Assembled entirely client-side from data the
 * module already fetched from the real backend — this service never fetches
 * anything itself and never learns a route.
 */
export interface AssistantModuleContext {
  /** Stable module identifier, e.g. "balanced_scorecards". Opaque to this service. */
  module: string;
  /** Human-readable module name for the prompt, e.g. "Balanced Scorecards". */
  moduleName: string;
  /** The route the user is on, carried through for provenance/logging only. */
  route: string;
  entity: AssistantEntityRef | null;
  /** Bounded business data for the current module/entity. Null when none is available yet. */
  data: Record<string, AssistantContextValue> | null;
  /** What the assistant may help with here, e.g. "analyze_kpis". Informational only. */
  capabilities: string[];
  /**
   * Static, developer-authored "how do I…" facts about this module's own UI
   * (button labels, required fields, navigation) — never business data. Lets
   * the assistant answer procedural questions honestly instead of treating
   * every non-data question as insufficient context.
   */
  helpContent: string[];
}

export type AssistantMessageRole = "user" | "assistant";

export interface AssistantMessage {
  role: AssistantMessageRole;
  content: string;
}

export interface AskAssistantInput {
  message: string;
  context: AssistantModuleContext;
  /** Prior turns, oldest first, already bounded by the caller. */
  history: AssistantMessage[];
}

/**
 * Structured, validated output. `insufficientContext` and `grounded` are
 * mutually informative but not opposites: a question entirely outside the
 * current module's scope is `insufficientContext: true` regardless of how
 * much data is present, because that data cannot ground an answer to it.
 */
export interface AssistantAnswer {
  answer: string;
  confidence: number;
  grounded: boolean;
  insufficientContext: boolean;
  referencedEntities: string[];
}

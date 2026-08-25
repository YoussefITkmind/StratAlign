/**
 * Domain types for the AI-generated Strategy Brief.
 *
 * Two shapes live here and they are deliberately different:
 *
 * - `StrategyBriefSnapshot` is the *bounded* view of the current Strategy
 *   Hierarchy that the model is allowed to see. Nothing outside it reaches a
 *   prompt.
 * - `StrategyBrief` is what a caller gets back. Its factual sections (themes,
 *   objectives, owners, progress, counts) are copied straight from the
 *   snapshot and are never taken from the model's answer — see
 *   `strategy-brief.service.ts`. Only the narrative sections originate with
 *   the model, and even those are re-grounded against the snapshot.
 */

export type BriefNodeStatus = "on-track" | "at-risk" | "off-track" | "not-started";

export type RiskSeverity = "low" | "medium" | "high";

/** Where a section's text came from. Editing a section flips it to `user`. */
export type BriefContentSource = "ai" | "user" | "strategy" | "none";

// ---------------------------------------------------------------------------
// Snapshot — the bounded input
// ---------------------------------------------------------------------------

export interface SnapshotObjective {
  readonly id: string;
  readonly name: string;
  readonly themeId: string | null;
  readonly themeName: string | null;
  /** Null when the hierarchy carries no owner name for this node. */
  readonly owner: string | null;
  /** 0-100. Null when nothing measurable backs this objective. */
  readonly progress: number | null;
  readonly status: BriefNodeStatus;
  /** How many KPIs/OKRs actually back the progress figure above. */
  readonly measureCount: number;
  readonly initiativeCount: number;
}

export interface SnapshotTheme {
  readonly id: string;
  readonly name: string;
  readonly objectiveCount: number;
  readonly status: BriefNodeStatus;
  readonly progress: number | null;
}

/**
 * A deterministic, data-derived concern. The model never invents these — it is
 * given this list and may only phrase and prioritise what is already here.
 */
export interface SnapshotRiskSignal {
  readonly kind:
    | "off_track_theme"
    | "at_risk_theme"
    | "off_track_objective"
    | "at_risk_objective"
    | "unmeasured_objective"
    | "unowned_objective"
    | "stalled_initiative"
    | "overdue_node";
  /** Theme name where one applies, so the model can echo the real area. */
  readonly area: string | null;
  /** The entity the signal was computed from, for traceability. */
  readonly nodeId: string;
  readonly nodeName: string;
  readonly detail: string;
}

export interface StrategyBriefSnapshot {
  readonly rootNodeId: string;
  readonly title: string;
  /** The plan's own description. The source of truth for Strategic Vision. */
  readonly vision: string | null;
  readonly owner: string | null;
  readonly status: BriefNodeStatus;
  readonly progress: number;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly totalNodes: number;
  readonly themes: readonly SnapshotTheme[];
  readonly objectives: readonly SnapshotObjective[];
  readonly initiativeCount: number;
  readonly projectCount: number;
  readonly measuredObjectiveCount: number;
  readonly riskSignals: readonly SnapshotRiskSignal[];
  /** True when the tree is too thin to support a trustworthy brief. */
  readonly insufficientData: boolean;
  /** Populated only when `insufficientData` is true. */
  readonly insufficientDataReason: string | null;
}

// ---------------------------------------------------------------------------
// Brief — the output
// ---------------------------------------------------------------------------

export interface BriefSection {
  readonly content: string | null;
  readonly source: BriefContentSource;
  /** The model's own text, retained so a user edit can be reverted. */
  readonly aiContent: string | null;
}

export interface BriefTheme {
  readonly id: string;
  readonly name: string;
  readonly objectiveCount: number;
}

export interface BriefObjective {
  readonly id: string;
  readonly name: string;
  readonly themeId: string | null;
  readonly themeName: string | null;
  readonly owner: string | null;
  readonly progress: number | null;
  readonly health: BriefNodeStatus;
}

export interface BriefRisk {
  readonly severity: RiskSeverity;
  readonly area: string | null;
  readonly title: string;
  readonly mitigation: string;
}

/**
 * Array members are intentionally not `readonly` here, unlike the snapshot's.
 * This type crosses the tRPC boundary, and a `readonly T[]` is not assignable
 * to the mutable array the router's output schema infers.
 */
export interface StrategyBrief {
  readonly rootNodeId: string;
  readonly title: string;
  readonly generatedAt: string;
  readonly executiveSummary: BriefSection;
  readonly strategicVision: BriefSection;
  readonly strategicThemes: BriefTheme[];
  readonly strategicObjectives: BriefObjective[];
  readonly expectedOutcomes: string[];
  readonly risks: BriefRisk[];
  /** True when the hierarchy could not support a reliable brief. */
  readonly insufficientData: boolean;
  readonly insufficientDataReason: string | null;
  /** Provenance, safe to display. Never carries a credential. */
  readonly provider: string;
  readonly model: string;
}

export type BriefEditableSection = "executiveSummary" | "strategicVision";

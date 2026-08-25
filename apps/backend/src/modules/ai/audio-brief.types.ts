/**
 * Shapes the Executive Audio Brief works with.
 *
 * The `*Port` interfaces are deliberately narrower than the services that
 * satisfy them: Audio Brief reads existing domain services (KPI registry,
 * performance, OKR registry, execution) and owns none of that data, so it
 * declares only the fields it actually reads. Structural typing means the real
 * services satisfy these without an adapter, and a unit test can satisfy them
 * with a literal.
 */

export type BriefKpiStatus = "on_track" | "watch" | "off_track" | "unknown";

export type BriefSignalKind = "kpi" | "okr" | "initiative";

/**
 * How much attention an item deserves in the brief. Ordered, and the order is
 * load-bearing: `rankSignals` sorts on it before it sorts on score, so a
 * positive achievement can never displace an off-track KPI.
 */
export type BriefSignalSeverity = "critical" | "warning" | "positive";

/** One item that survived selection and is allowed to reach the model. */
export interface BriefSignal {
  readonly kind: BriefSignalKind;
  readonly id: string;
  readonly name: string;
  readonly severity: BriefSignalSeverity;
  /** Deterministic ranking weight. Never sent to the model. */
  readonly score: number;
  /** Short, already-English description of why this item was selected. */
  readonly headline: string;
  /** The grounded numbers behind `headline`. Empty when there are none. */
  readonly detail: string;
}

/** Normalised KPI facts, assembled from registry + performance. */
export interface BriefKpiSnapshot {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly polarity: "higher_is_better" | "lower_is_better";
  readonly status: BriefKpiStatus;
  readonly actual: number | null;
  readonly target: number | null;
  readonly previous: number | null;
  readonly period: string | null;
}

/** Normalised OKR facts, assembled from the OKR registry. */
export interface BriefOkrSnapshot {
  readonly id: string;
  readonly name: string;
  /** Mean of the key results that report progress. Null when none do. */
  readonly progressPercent: number | null;
  readonly keyResultCount: number;
}

/** Normalised initiative facts, assembled from execution. */
export interface BriefInitiativeSnapshot {
  readonly id: string;
  readonly name: string;
  readonly stage: string;
  readonly status: "on_track" | "at_risk" | "off_track" | null;
  readonly confidence: "high" | "medium" | "low" | null;
}

export interface BriefSnapshot {
  readonly kpis: readonly BriefKpiSnapshot[];
  readonly okrs: readonly BriefOkrSnapshot[];
  readonly initiatives: readonly BriefInitiativeSnapshot[];
}

// ---------------------------------------------------------------------------
// Ports onto existing domain services
// ---------------------------------------------------------------------------

export interface AudioBriefKpiRegistryPort {
  list(): Promise<
    ReadonlyArray<{
      definition: { id: string; status: string };
      version: { nameEn: string; unit: string; polarity: string };
    }>
  >;
}

export interface AudioBriefPerformancePort {
  getKpiDetail(kpiDefinitionId: string): Promise<{
    period: string | null;
    targets: ReadonlyArray<{ scopeNodeId: string; period: string; targetValue: number }>;
    measurements: ReadonlyArray<{
      scopeNodeId: string;
      period: string;
      value: number;
      createdAt: Date;
    }>;
    statuses: ReadonlyArray<{ scopeNodeId: string; period: string; status: string }>;
  } | null>;
}

export interface AudioBriefOkrRegistryPort {
  list(): Promise<
    ReadonlyArray<{
      id: string;
      nameEn: string;
      keyResults: ReadonlyArray<{ progressPercent: number | null }>;
    }>
  >;
}

export interface AudioBriefExecutionPort {
  list(input: {
    scope: "all";
    actorUserId: string;
  }): Promise<
    ReadonlyArray<{
      id: string;
      nameEn: string;
      stage: string;
      latestStatus: string | null;
      latestConfidence: string | null;
    }>
  >;
}

export interface AudioBriefDataSources {
  readonly kpiRegistry: AudioBriefKpiRegistryPort;
  readonly performance: AudioBriefPerformancePort;
  readonly okrRegistry: AudioBriefOkrRegistryPort;
  readonly execution: AudioBriefExecutionPort;
}

// ---------------------------------------------------------------------------
// Service contract
// ---------------------------------------------------------------------------

export interface GenerateAudioBriefInput {
  readonly actorUserId: string;
  /**
   * Reserved for role-personalised briefs. v1 accepts it, records it, and
   * changes nothing on it — the shape is here so adding personalisation later
   * is not a breaking change to every caller.
   */
  readonly role?: string;
}

export interface AudioBriefResult {
  readonly title: string;
  readonly script: string;
  /** True when nothing significant was found and the fixed message was used. */
  readonly insufficientData: boolean;
  readonly audio: {
    readonly base64: string;
    readonly contentType: string;
    readonly format: "mp3";
  };
}

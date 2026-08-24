/**
 * Shared shapes for the Executive Audio Brief feature (Task 6).
 *
 * `AudioBriefSignal*` types are the deterministic input this module derives
 * from real KPI/OKR/initiative data before anything reaches the LLM.
 * `AudioBriefItem` is the small, bounded set of significant items actually
 * selected — the only data the model is shown, and the data the client sees
 * back. Nothing here is invented by the model: `audio-brief.significance.ts`
 * builds these from real service data with pure, testable rules.
 */

export type SignalImportance = "critical" | "medium" | "positive";
export type SignalKind = "kpi" | "okr" | "initiative";

export interface KpiSignal {
  readonly kpiDefinitionId: string;
  readonly nameEn: string;
  readonly unit: string;
  readonly polarity: "higher_is_better" | "lower_is_better";
  /** Normalised the same way the Home overview normalises it. */
  readonly status: "on_track" | "watch" | "off_track" | "unknown";
  readonly actual: number;
  readonly target: number | null;
  /** `actual` minus the immediately preceding measurement in the same series. */
  readonly delta: number | null;
}

export interface OkrKeyResultSignal {
  readonly titleEn: string;
  readonly progressPercent: number | null;
}

export interface OkrSignal {
  readonly okrId: string;
  readonly nameEn: string;
  readonly keyResults: readonly OkrKeyResultSignal[];
}

export interface InitiativeSignal {
  readonly initiativeId: string;
  readonly nameEn: string;
  readonly status: "on_track" | "at_risk" | "off_track" | null;
}

export interface AudioBriefSignals {
  readonly kpis: readonly KpiSignal[];
  readonly okrs: readonly OkrSignal[];
  readonly initiatives: readonly InitiativeSignal[];
}

/**
 * One line of the briefing. Always traceable to a real `KpiSignal`,
 * `OkrSignal`, or `InitiativeSignal` — see `audio-brief.significance.ts`.
 */
export interface AudioBriefItem {
  readonly type: SignalKind;
  readonly name: string;
  readonly importance: SignalImportance;
  readonly reason: string;
}

/**
 * Reserved for future per-role personalisation (V1 always generates a
 * generic brief and ignores this). Kept as a real, typed parameter on
 * `AiAudioBriefService.generate` rather than a role enum + UI, per the V1
 * scope: the extension point exists without anything using it yet.
 */
export type ExecutiveRole = string;

export interface AudioBriefResult {
  readonly title: string;
  readonly script: string;
  /**
   * A plain (non-readonly) array, unlike the rest of this file: this crosses
   * the tRPC boundary in `packages/api/src/audio-brief.ts`, whose `.output()`
   * schema infers a mutable array type that a `readonly` array cannot satisfy.
   */
  readonly items: AudioBriefItem[];
  readonly audioBase64: string;
  readonly audioMimeType: string;
  readonly provider: string;
  readonly model: string;
  readonly ttsProvider: string;
  readonly ttsModel: string;
  readonly latencyMs: number;
}

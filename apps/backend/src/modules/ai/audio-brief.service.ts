import type { Logger } from "../../logging/logger";
import type { ExecutionService } from "../execution/execution.service";
import type { PerformanceService } from "../performance/performance.service";
import type { KpiRegistryService } from "../registry/kpi-registry.service";
import type { OkrService } from "../registry/okr.service";

import { AiMalformedOutputError } from "./ai.errors";
import {
  AUDIO_BRIEF_FEATURE,
  AUDIO_BRIEF_SYSTEM_PROMPT,
  buildAudioBriefPrompt,
} from "./audio-brief.prompt";
import { audioBriefScriptSchema } from "./audio-brief.schema";
import { selectSignificantItems } from "./audio-brief.significance";
import type {
  AudioBriefItem,
  AudioBriefResult,
  AudioBriefSignals,
  ExecutiveRole,
  InitiativeSignal,
  KpiSignal,
  OkrSignal,
} from "./audio-brief.types";
import type { LlmProvider } from "./llm.provider";
import { extractJsonObject } from "./suggestion.schema";
import type { TtsProvider } from "./tts.provider";

/** Bounds how many active KPIs are scanned for significance per generation — a briefing is short, not a full audit. */
const MAX_KPIS_SCANNED = 30;
const MAX_OUTPUT_TOKENS = 512;
/** Low: this is a factual briefing over already-selected data, not a creative task. */
const TEMPERATURE = 0.3;

const EMPTY_BRIEF_TITLE = "Executive Audio Brief";
const EMPTY_BRIEF_SCRIPT =
  "No significant executive updates are available for this reporting period.";

function normalizeKpiStatus(
  status: string | null | undefined,
): KpiSignal["status"] {
  const value = (status ?? "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (value === "on_track" || value === "green") return "on_track";
  if (value === "watch" || value === "at_risk" || value === "amber") return "watch";
  if (value === "off_track" || value === "breached" || value === "red") return "off_track";
  return "unknown";
}

/**
 * Turns `PerformanceService.getKpiDetail`'s output into a `KpiSignal`.
 *
 * Mirrors the frontend Home overview's own reduction (`home.ts`'s
 * `snapshot` procedure): the latest measurement per scope decides "current",
 * and the immediately preceding measurement in that same scope's series
 * gives the delta. Both read the same Performance data the same way, on
 * purpose — this is the backend counterpart of what the executive already
 * sees on the Home overview, not a second interpretation of it.
 */
function toKpiSignal(
  detail: NonNullable<Awaited<ReturnType<PerformanceService["getKpiDetail"]>>>,
): KpiSignal | null {
  const measurements = [...detail.measurements].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const latestMeasurement = measurements.at(-1);
  if (!latestMeasurement) return null;

  const target = [...detail.targets]
    .reverse()
    .find(
      (candidate) =>
        candidate.scopeNodeId === latestMeasurement.scopeNodeId &&
        candidate.period === latestMeasurement.period,
    );
  const status = [...detail.statuses]
    .reverse()
    .find(
      (candidate) =>
        candidate.scopeNodeId === latestMeasurement.scopeNodeId &&
        candidate.period === latestMeasurement.period,
    );

  const scopeHistory = measurements.filter(
    (candidate) => candidate.scopeNodeId === latestMeasurement.scopeNodeId,
  );
  const prior = scopeHistory.length > 1 ? scopeHistory.at(-2) ?? null : null;

  return {
    kpiDefinitionId: detail.definition.id,
    nameEn: detail.version.nameEn,
    unit: detail.version.unit,
    polarity: detail.version.polarity as KpiSignal["polarity"],
    status: normalizeKpiStatus(status?.status),
    actual: latestMeasurement.value,
    target: target?.targetValue ?? null,
    delta: prior === null ? null : latestMeasurement.value - prior.value,
  };
}

/**
 * Gathers real report data, deterministically selects what is significant,
 * asks OpenAI to write a short English script grounded in exactly that
 * selection, validates the script, then converts it to speech with OpenAI
 * TTS.
 *
 * `llm` and `tts` are always OpenAI here regardless of the platform-wide
 * `AI_PROVIDER` — see `llm.factory.ts#createOpenAiOnlyProvider` for why.
 */
export class AiAudioBriefService {
  constructor(
    private readonly kpis: KpiRegistryService,
    private readonly okrs: OkrService,
    private readonly execution: ExecutionService,
    private readonly performance: PerformanceService,
    private readonly llm: LlmProvider,
    private readonly tts: TtsProvider,
    private readonly ttsModel: string,
    private readonly ttsVoice: string,
    private readonly logger: Logger,
  ) {}

  /**
   * `role` is accepted now so the abstraction exists, but V1 never branches
   * on it — see `ExecutiveRole` in `audio-brief.types.ts`.
   */
  async generate(actorUserId: string, role?: ExecutiveRole): Promise<AudioBriefResult> {
    const startedAt = Date.now();
    const signals = await this.gatherSignals(actorUserId);
    const items = selectSignificantItems(signals);

    const { title, script, provider, model } =
      items.length === 0
        ? { title: EMPTY_BRIEF_TITLE, script: EMPTY_BRIEF_SCRIPT, provider: "none", model: "none" }
        : await this.generateScript(items);

    const audio = await this.tts.synthesize({
      text: script,
      voice: this.ttsVoice,
      model: this.ttsModel,
      feature: AUDIO_BRIEF_FEATURE,
    });

    const result: AudioBriefResult = {
      title,
      script,
      items,
      audioBase64: audio.audio.toString("base64"),
      audioMimeType: audio.mimeType,
      provider,
      model,
      ttsProvider: audio.provider,
      ttsModel: audio.model,
      latencyMs: Date.now() - startedAt,
    };

    this.logger.info("Generated executive audio brief", {
      feature: AUDIO_BRIEF_FEATURE,
      actorUserId,
      role: role ?? null,
      selectedItems: items.length,
      provider: result.provider,
      model: result.model,
      ttsProvider: result.ttsProvider,
      ttsModel: result.ttsModel,
      totalLatencyMs: result.latencyMs,
    });

    return result;
  }

  private async generateScript(
    items: readonly AudioBriefItem[],
  ): Promise<{ title: string; script: string; provider: string; model: string }> {
    const completion = await this.llm.complete({
      system: AUDIO_BRIEF_SYSTEM_PROMPT,
      prompt: buildAudioBriefPrompt(items),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      feature: AUDIO_BRIEF_FEATURE,
    });

    const parsed = this.parseCompletion(completion.text);

    return {
      title: parsed.title,
      script: parsed.script,
      provider: completion.provider,
      model: completion.model,
    };
  }

  private parseCompletion(text: string): { title: string; script: string } {
    if (!text.trim()) {
      throw new AiMalformedOutputError("The AI service returned no content");
    }

    const json = extractJsonObject(text);
    if (!json) {
      throw new AiMalformedOutputError();
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(json);
    } catch {
      throw new AiMalformedOutputError();
    }

    const result = audioBriefScriptSchema.safeParse(decoded);
    if (!result.success) {
      this.logger.warn("Audio brief script failed schema validation", {
        feature: AUDIO_BRIEF_FEATURE,
        issuePaths: result.error.issues.map((issue) => issue.path.join(".")),
      });
      throw new AiMalformedOutputError();
    }

    return { title: result.data.title, script: result.data.script };
  }

  private async gatherSignals(actorUserId: string): Promise<AudioBriefSignals> {
    const [kpiDefinitions, okrs, initiatives] = await Promise.all([
      this.kpis.list(),
      this.okrs.list(),
      this.execution.list({ scope: "all", actorUserId }),
    ]);

    const activeKpis = kpiDefinitions
      .filter((row) => row.definition.status === "active")
      .slice(0, MAX_KPIS_SCANNED);

    const kpiDetails = await Promise.all(
      activeKpis.map((row) => this.performance.getKpiDetail(row.definition.id)),
    );

    const kpis: KpiSignal[] = kpiDetails
      .filter((detail): detail is NonNullable<typeof detail> => detail !== null)
      .map(toKpiSignal)
      .filter((signal): signal is KpiSignal => signal !== null);

    const okrSignals: OkrSignal[] = okrs.map((okr) => ({
      okrId: okr.id,
      nameEn: okr.nameEn,
      keyResults: okr.keyResults.map((keyResult) => ({
        titleEn: keyResult.titleEn ?? okr.nameEn,
        progressPercent: keyResult.progressPercent,
      })),
    }));

    const initiativeSignals: InitiativeSignal[] = initiatives.map((initiative) => ({
      initiativeId: initiative.id,
      nameEn: initiative.nameEn,
      status: initiative.latestStatus,
    }));

    return { kpis, okrs: okrSignals, initiatives: initiativeSignals };
  }
}

import type { Logger } from "../../logging/logger";

import { AiMalformedOutputError } from "./ai.errors";
import { collectBriefSnapshot } from "./audio-brief.collector";
import {
  AUDIO_BRIEF_FEATURE,
  AUDIO_BRIEF_SYSTEM_PROMPT,
  buildAudioBriefPrompt,
  NO_SIGNIFICANT_DATA_SCRIPT,
  NO_SIGNIFICANT_DATA_TITLE,
} from "./audio-brief.prompt";
import {
  audioBriefScriptSchema,
  containsArabicScript,
  type ValidatedAudioBriefScript,
} from "./audio-brief.schema";
import { selectSignificantSignals } from "./audio-brief.selection";
import type {
  AudioBriefDataSources,
  AudioBriefResult,
  BriefSignal,
  GenerateAudioBriefInput,
} from "./audio-brief.types";
import type { LlmProvider } from "./llm.provider";
import { extractJsonObject } from "./suggestion.schema";
import type { TtsProvider } from "./tts.provider";

const MAX_OUTPUT_TOKENS = 700;

/** Low: this is a summary of supplied figures, not a piece of writing. */
const TEMPERATURE = 0.3;

/**
 * The AI Executive Audio Brief.
 *
 * The pipeline is fixed and every stage narrows what the next one can do:
 *
 *   existing domain data
 *     → deterministic significance selection (bounded, pure, testable)
 *     → OpenAI, seeing only the selected signals
 *     → schema validation of a structured response
 *     → English-only validation
 *     → OpenAI text-to-speech
 *     → audio
 *
 * Two properties are worth stating outright, because both are guarded here
 * rather than by convention. Nothing unvalidated ever reaches the speech
 * call — `speak` is the single entry point to TTS and it re-checks the text
 * even for the fixed no-data message. And an empty selection never reaches the
 * model at all: a briefing about nothing is precisely the situation in which a
 * model invents an executive update.
 */
export class AudioBriefService {
  constructor(
    private readonly sources: AudioBriefDataSources,
    /**
     * Always an OpenAI-backed provider, constructed independently of the
     * platform-wide `AI_PROVIDER` setting. Typed as the shared interface so
     * this class still owns no vendor detail.
     */
    private readonly llm: LlmProvider,
    private readonly tts: TtsProvider,
    private readonly logger: Logger,
  ) {}

  /**
   * `input.role` is accepted and logged but changes nothing in v1. The
   * parameter exists so role-personalised briefs can be added without every
   * caller changing shape.
   */
  async generate(input: GenerateAudioBriefInput): Promise<AudioBriefResult> {
    const snapshot = await collectBriefSnapshot(this.sources, input.actorUserId);
    const signals = selectSignificantSignals(snapshot);

    this.logger.info("Selected executive brief signals", {
      feature: AUDIO_BRIEF_FEATURE,
      role: input.role ?? null,
      kpisInspected: snapshot.kpis.length,
      okrsInspected: snapshot.okrs.length,
      initiativesInspected: snapshot.initiatives.length,
      signalsSelected: signals.length,
    });

    if (signals.length === 0) {
      return this.speak(
        { title: NO_SIGNIFICANT_DATA_TITLE, script: NO_SIGNIFICANT_DATA_SCRIPT },
        true,
      );
    }

    const written = await this.write(signals);
    return this.speak(written, false);
  }

  private async write(signals: readonly BriefSignal[]): Promise<ValidatedAudioBriefScript> {
    const completion = await this.llm.complete({
      system: AUDIO_BRIEF_SYSTEM_PROMPT,
      prompt: buildAudioBriefPrompt(signals),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      feature: AUDIO_BRIEF_FEATURE,
      responseFormat: "json",
    });

    const script = this.parseCompletion(completion.text);

    this.logger.info("Generated executive brief script", {
      feature: AUDIO_BRIEF_FEATURE,
      provider: completion.provider,
      model: completion.model,
      latencyMs: completion.latencyMs,
      scriptCharacters: script.script.length,
    });

    return script;
  }

  private parseCompletion(text: string): ValidatedAudioBriefScript {
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
      this.logger.warn("Executive brief response failed schema validation", {
        feature: AUDIO_BRIEF_FEATURE,
        issuePaths: result.error.issues.map((issue) => issue.path.join(".")),
      });
      throw new AiMalformedOutputError();
    }

    return result.data;
  }

  /**
   * The only path to the speech provider.
   *
   * The English check repeats what the schema already enforced for generated
   * text. That is intentional defence in depth: this method is also how the
   * fixed no-data message reaches TTS, so putting the check here means every
   * string that is ever spoken has been through it, not just model output.
   */
  private async speak(
    script: ValidatedAudioBriefScript,
    insufficientData: boolean,
  ): Promise<AudioBriefResult> {
    if (containsArabicScript(script.script) || containsArabicScript(script.title)) {
      this.logger.warn("Refused to synthesise a non-English executive brief", {
        feature: AUDIO_BRIEF_FEATURE,
        insufficientData,
      });
      throw new AiMalformedOutputError();
    }

    const synthesis = await this.tts.synthesize({
      text: script.script,
      feature: AUDIO_BRIEF_FEATURE,
    });

    return {
      title: script.title,
      script: script.script,
      insufficientData,
      audio: {
        base64: synthesis.audio.toString("base64"),
        contentType: synthesis.contentType,
        format: synthesis.format,
      },
    };
  }
}

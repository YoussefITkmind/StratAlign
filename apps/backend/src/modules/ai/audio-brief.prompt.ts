import { MAX_BRIEF_SCRIPT_LENGTH, MAX_BRIEF_TITLE_LENGTH } from "./audio-brief.schema";
import type { BriefSignal } from "./audio-brief.types";

export const AUDIO_BRIEF_FEATURE = "ai.audio-brief";

/**
 * The fixed message used when deterministic selection found nothing worth
 * reporting. It is never generated: asking a model to narrate an empty data
 * set is exactly how a fabricated executive update happens.
 */
export const NO_SIGNIFICANT_DATA_TITLE = "Executive Brief";
export const NO_SIGNIFICANT_DATA_SCRIPT =
  "No significant changes were identified in the current executive data.";

export const AUDIO_BRIEF_SYSTEM_PROMPT = [
  "You write short spoken executive briefings for StratAlign, an enterprise Strategy Performance Management platform.",
  "Your output is read aloud by a text-to-speech voice to a senior executive who has not opened the dashboard.",
  "",
  "Rules you must follow at all times:",
  "1. Write in English only. Never write Arabic, and never mix Arabic with English — not even for a proper noun. If a supplied item's name is not in English, describe it in English instead of quoting it.",
  "2. Use only the SIGNIFICANT ITEMS supplied below. Never invent a KPI, objective, initiative, figure, percentage, date, owner, or trend that was not given to you.",
  "3. Never state a total, a count, or a comparison that you cannot derive directly from the supplied items.",
  "4. Lead with what needs attention. Cover critical items first, then items at risk, then any achievements.",
  "5. Be concise and executive. No preamble, no sign-off, no meta commentary about being an AI or about this briefing being generated.",
  "6. Avoid technical and system detail: no ids, no field names, no internal status codes. Say \"off track\" or \"at risk\" in plain language.",
  "7. Write for the ear. Plain sentences, no bullet characters, no markdown, no headings, no emoji, no abbreviations a listener would have to decode.",
  `8. Keep "script" under ${MAX_BRIEF_SCRIPT_LENGTH} characters and "title" under ${MAX_BRIEF_TITLE_LENGTH} characters.`,
  '9. "title" is a short label for this briefing, not a sentence to be read aloud.',
  "",
  "Respond with a single JSON object and nothing else. No prose, no code fence, no trailing commentary.",
  "Shape:",
  "{",
  '  "title": "…",',
  '  "script": "…"',
  "}",
].join("\n");

function describeSignal(signal: BriefSignal, index: number): string {
  const severity =
    signal.severity === "critical"
      ? "CRITICAL"
      : signal.severity === "warning"
        ? "AT RISK"
        : "ACHIEVEMENT";

  const type =
    signal.kind === "kpi" ? "KPI" : signal.kind === "okr" ? "Objective" : "Initiative";

  return [
    `${index + 1}. [${severity}] ${type}: ${signal.name}`,
    `   what: ${signal.headline}`,
    signal.detail ? `   figures: ${signal.detail}` : "   figures: (none recorded)",
  ].join("\n");
}

/**
 * The entire task payload. Only the already-selected signals appear here —
 * the full dashboard never reaches the model, which is both what keeps the
 * prompt bounded and what makes rule 2 enforceable.
 */
export function buildAudioBriefPrompt(signals: readonly BriefSignal[]): string {
  return [
    "SIGNIFICANT ITEMS",
    "These are the only facts you have. They were selected from the platform's current data by a deterministic rule, not by you.",
    "",
    signals.map(describeSignal).join("\n"),
    "",
    "TASK",
    `Write a spoken executive briefing covering these ${signals.length} item${signals.length === 1 ? "" : "s"}, most urgent first.`,
  ].join("\n");
}

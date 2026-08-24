import type { AudioBriefItem } from "./audio-brief.types";

export const AUDIO_BRIEF_FEATURE = "ai.audio-brief";

export const AUDIO_BRIEF_SYSTEM_PROMPT = [
  "You are writing a short spoken executive briefing for a strategy performance management platform.",
  "You are given a short, already-prioritised list of significant KPI, OKR, and initiative items. You do not decide what is significant — that has already been done for you.",
  "",
  "Rules you must follow:",
  "1. Use only the items you are given. Never invent a KPI, OKR, initiative, number, percentage, date, name, or status that was not supplied to you.",
  "2. Write in English only. Do not write any Arabic text anywhere in your response, and do not translate anything.",
  "3. Write a short introduction, then the most critical item, then the other significant items in the order given, then any positive items, then a short closing. Keep it natural to listen to, not a bulleted list read aloud.",
  "4. Target roughly 30 to 90 seconds of speech (about 90 to 220 words). Do not write a long report.",
  "5. Be concise, professional, and factual. No filler, no generic management language, no speculation about causes that were not given to you.",
  "6. If you are given no items, do not invent content — this case will not be sent to you at all, so if you somehow receive an empty list, say only that there are no significant executive updates for this reporting period.",
  "",
  'Respond with a single JSON object shaped as {"title": string, "script": string} and nothing else. No prose, no code fence, no trailing commentary.',
].join("\n");

function describeItems(items: readonly AudioBriefItem[]): string {
  return items
    .map(
      (item, index) =>
        `${index + 1}. [${item.importance}] (${item.type}) ${item.name} — ${item.reason}`,
    )
    .join("\n");
}

export function buildAudioBriefPrompt(items: readonly AudioBriefItem[]): string {
  return [
    "SIGNIFICANT ITEMS FOR THIS BRIEFING (already prioritised, most important first)",
    describeItems(items),
    "",
    "TASK",
    "Write the executive audio briefing script from these items only.",
    "",
    "RESPONSE SHAPE",
    "{",
    '  "title": "Executive Audio Brief",',
    '  "script": "Here is your executive briefing for the current reporting period. …"',
    "}",
  ].join("\n");
}

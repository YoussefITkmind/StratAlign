import { z } from "zod";

/**
 * The contract the model's audio-brief output must satisfy, plus the
 * English-only guarantee.
 *
 * The prompt asks for English. This file is why that request is not the only
 * thing standing between an Arabic script and the text-to-speech call: a
 * prompt is a request, and a request can be ignored. Every string that reaches
 * TTS passes `assertEnglishOnly` first, including the fixed no-data message,
 * so there is exactly one gate and no path around it.
 */

/**
 * Arabic, Arabic Supplement, Arabic Extended-A, and both presentation-forms
 * blocks. Covers Arabic script in any of the encodings a model may emit.
 *
 * The final range stops at FEFC rather than FEFF deliberately: FEFF is the
 * byte-order mark, which is not Arabic and would otherwise reject an
 * otherwise-valid English script that happened to arrive with a BOM.
 */
const ARABIC_SCRIPT_PATTERN = new RegExp(
  "[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]",
);

export const MAX_BRIEF_TITLE_LENGTH = 120;

/**
 * Roughly ninety seconds of speech. The cap is a product decision as much as a
 * cost one — an executive brief that runs longer than this is a report — and
 * it also bounds the audio payload that has to travel to the browser.
 */
export const MAX_BRIEF_SCRIPT_LENGTH = 1_400;

export function containsArabicScript(value: string): boolean {
  return ARABIC_SCRIPT_PATTERN.test(value);
}

const englishOnly = (value: string): boolean => !containsArabicScript(value);

const ENGLISH_ONLY_MESSAGE = "The executive brief must be written in English only";

/**
 * The structured shape the model must answer in. Free-form prose is never
 * accepted: it is this object, validated, or it is a malformed response.
 */
export const audioBriefScriptSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(MAX_BRIEF_TITLE_LENGTH)
      .refine(englishOnly, { message: ENGLISH_ONLY_MESSAGE }),
    script: z
      .string()
      .trim()
      .min(1)
      .max(MAX_BRIEF_SCRIPT_LENGTH)
      .refine(englishOnly, { message: ENGLISH_ONLY_MESSAGE }),
  })
  .strict();

export type ValidatedAudioBriefScript = z.infer<typeof audioBriefScriptSchema>;

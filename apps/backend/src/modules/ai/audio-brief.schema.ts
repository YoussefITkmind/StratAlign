import { z } from "zod";

/**
 * The contract the model's script-generation output must satisfy before the
 * script reaches text-to-speech. Free-form text is never spoken: it is
 * either this shape or it is rejected (`AiMalformedOutputError`).
 *
 * The model's own `items` field, if present, is deliberately not part of
 * this schema: `AiAudioBriefService` returns the deterministic items it fed
 * the model (see `audio-brief.significance.ts`), never anything the model
 * reports back about itself, so there is nothing here for it to corrupt.
 */

/** Roughly a 30-90 second read at a natural speaking pace. */
const MIN_SCRIPT_LENGTH = 40;
const MAX_SCRIPT_LENGTH = 1_400;

/** Cheap defence in depth alongside the prompt's English-only instruction. */
const ARABIC_SCRIPT_PATTERN = /[؀-ۿ]/;

export const audioBriefScriptSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    script: z
      .string()
      .trim()
      .min(MIN_SCRIPT_LENGTH)
      .max(MAX_SCRIPT_LENGTH)
      .refine((value) => !ARABIC_SCRIPT_PATTERN.test(value), {
        message: "Script must be English only",
      }),
  })
  .passthrough();

export type AudioBriefScript = z.infer<typeof audioBriefScriptSchema>;

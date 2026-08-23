import { z } from "zod";

/**
 * The contract the model's output must satisfy before anything else looks at
 * it. Free-form text is never parsed by hand and never reaches a service: it is
 * either this shape or it is rejected.
 *
 * Every constraint here mirrors a constraint the registry domain already
 * enforces (`KpiFrequency`, `KpiPolarity`, `KeyResultType`, the non-empty
 * bilingual names). Anything the model gets wrong therefore fails at this
 * boundary rather than deeper, where the message would be less useful.
 */

export const MIN_SUGGESTIONS = 0;
export const MAX_SUGGESTIONS = 12;
export const MAX_KEY_RESULTS = 6;

const shortText = z.string().trim().min(1).max(300);
const longText = z.string().trim().max(2_000);

const keyResultSchema = z
  .object({
    titleEn: shortText,
    titleAr: shortText,
    type: z.enum(["quantitative", "milestone"]),
    targetValue: z.number().finite(),
    unit: z.string().trim().min(1).max(50),
  })
  .strict();

const baseSuggestionSchema = z.object({
  type: z.enum(["kpi", "okr"]),
  titleEn: shortText,
  titleAr: shortText,
  descriptionEn: longText.nullish(),
  descriptionAr: longText.nullish(),
  // A self-estimate on a fixed 0-1 scale. Anything outside it means the model
  // ignored the scale, which makes the whole item untrustworthy.
  confidence: z.number().min(0).max(1),
  rationale: longText.nullish(),

  // KPI-only.
  unit: z.string().trim().min(1).max(50).nullish(),
  frequency: z.enum(["monthly", "quarterly"]).nullish(),
  polarity: z.enum(["higher_is_better", "lower_is_better"]).nullish(),

  // OKR-only. Structural check only — whether this id actually names a real
  // objective in scope is `isApplicable`'s job downstream, which drops just
  // that one suggestion on a mismatch. Requiring exact UUID format here
  // instead would fail the model's *entire* response (every KPI in the same
  // batch included) the moment one OKR's id isn't shaped exactly right,
  // which is a much larger loss than dropping the one bad item.
  objectiveNodeId: z.string().trim().min(1).max(200).nullish(),
  keyResults: z.array(keyResultSchema).max(MAX_KEY_RESULTS).nullish(),
});

/**
 * Type-conditional requirements.
 *
 * A KPI without a unit cannot be measured, and an OKR without a key result is
 * an aspiration rather than an objective — the registry's own `OkrService`
 * refuses the latter, so refusing it here keeps the two in step.
 */
export const llmSuggestionSchema = baseSuggestionSchema.superRefine(
  (suggestion, context) => {
    if (suggestion.type === "kpi") {
      if (!suggestion.unit) {
        context.addIssue({
          code: "custom",
          path: ["unit"],
          message: "A KPI suggestion requires a unit",
        });
      }
      if (!suggestion.frequency) {
        context.addIssue({
          code: "custom",
          path: ["frequency"],
          message: "A KPI suggestion requires a frequency",
        });
      }
      if (!suggestion.polarity) {
        context.addIssue({
          code: "custom",
          path: ["polarity"],
          message: "A KPI suggestion requires a polarity",
        });
      }
      return;
    }

    if (!suggestion.objectiveNodeId) {
      context.addIssue({
        code: "custom",
        path: ["objectiveNodeId"],
        message: "An OKR suggestion must name the objective it hangs from",
      });
    }

    if (!suggestion.keyResults || suggestion.keyResults.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["keyResults"],
        message: "An OKR suggestion requires at least one key result",
      });
    }
  },
);

/**
 * The outer envelope only. Deliberately not `.strict()` and deliberately not
 * validating each suggestion's shape here: a model that adds a stray
 * top-level field (a "note", a "reasoning" aside) or gets one suggestion
 * wrong must not fail every other suggestion in the same completion. Each
 * element is re-validated individually by `llmSuggestionSchema` — see
 * `parseLlmSuggestions` below.
 */
const suggestionsEnvelopeSchema = z.object({
  suggestions: z.array(z.unknown()).min(MIN_SUGGESTIONS).max(MAX_SUGGESTIONS),
});

export type LlmSuggestion = z.infer<typeof llmSuggestionSchema>;

export interface ParsedLlmSuggestions {
  suggestions: LlmSuggestion[];
  /** Individually-invalid items dropped without failing the rest. */
  droppedCount: number;
}

/**
 * Validates the envelope, then each suggestion on its own. One malformed
 * item (wrong enum casing, a stray field, a mistyped number) is dropped
 * rather than discarding every valid suggestion beside it in the same
 * completion — the same principle `acceptMany` already applies on the way
 * back in.
 *
 * Returns `null` only when the response isn't shaped like a suggestion list
 * at all (not an object, no `suggestions` array) — that is the one case
 * nothing here can salvage.
 */
export function parseLlmSuggestions(decoded: unknown): ParsedLlmSuggestions | null {
  const envelope = suggestionsEnvelopeSchema.safeParse(decoded);

  if (!envelope.success) {
    return null;
  }

  const suggestions: LlmSuggestion[] = [];
  let droppedCount = 0;

  for (const raw of envelope.data.suggestions) {
    const result = llmSuggestionSchema.safeParse(raw);

    if (result.success) {
      suggestions.push(result.data);
    } else {
      droppedCount += 1;
    }
  }

  return { suggestions, droppedCount };
}

/**
 * Pulls the JSON object out of a completion.
 *
 * Models wrap JSON in prose or a fenced block often enough that refusing on the
 * first stray backtick would fail generations that are otherwise perfectly
 * good. Only the outermost brace-delimited span is considered — this narrows
 * the text, it does not interpret it, and the schema still has the final say.
 */
export function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return trimmed.slice(start, end + 1);
}

import { z } from "zod";

/**
 * The contract the model's output must satisfy before anything else looks at
 * it. Same discipline as `suggestion.schema.ts`: free-form text is never
 * parsed by hand and never reaches a caller — it is either this shape or it
 * is rejected as `AiMalformedOutputError`.
 */

export const MAX_RECOMMENDED_STEPS = 6;
export const MAX_EVIDENCE_ITEMS = 10;

const diagnosisText = z.string().trim().min(1).max(2_000);
const shortText = z.string().trim().min(1).max(500);

export const investigationOutputSchema = z
  .object({
    diagnosis: diagnosisText,
    likelyCause: z.string().trim().min(1).max(300).nullable(),
    recommendedNextSteps: z.array(shortText).max(MAX_RECOMMENDED_STEPS),
    confidence: z.number().min(0).max(1),
    insufficientData: z.boolean(),
    evidence: z.array(shortText).max(MAX_EVIDENCE_ITEMS),
  })
  .strict()
  .superRefine((output, context) => {
    // The mandatory rule from the spec: insufficient evidence must not come
    // bundled with a named cause. A model that reports both is treating
    // speculation as fact, which this boundary refuses outright rather than
    // silently dropping the field.
    if (output.insufficientData && output.likelyCause !== null) {
      context.addIssue({
        code: "custom",
        path: ["likelyCause"],
        message: "insufficientData responses must not also state a likely cause",
      });
    }
  });

export type InvestigationOutput = z.infer<typeof investigationOutputSchema>;

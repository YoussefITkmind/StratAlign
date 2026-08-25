import { z } from "zod";

/**
 * The only shape a sync diagnosis may take.
 *
 * Mirrors `assistant.schema.ts`: model text is parsed once, checked here, and
 * rejected outright if it does not match. Nothing downstream re-validates, and
 * no free prose ever reaches a caller.
 */

export const MAX_DIAGNOSIS_LENGTH = 600;
export const MAX_CAUSE_LENGTH = 400;
export const MAX_EVIDENCE_ITEMS = 6;
export const MAX_EVIDENCE_LENGTH = 240;
export const MAX_ACTION_ITEMS = 5;
export const MAX_ACTION_LENGTH = 240;

export const investigationConfidenceSchema = z.enum(["low", "medium", "high"]);

export type InvestigationConfidence = z.infer<typeof investigationConfidenceSchema>;

export const syncDiagnosisSchema = z
  .object({
    /** One or two sentences. Long-form analysis is not useful in a table row. */
    diagnosis: z.string().trim().min(1).max(MAX_DIAGNOSIS_LENGTH),
    /** Null is the honest answer whenever the evidence does not single one out. */
    likelyCause: z.string().trim().min(1).max(MAX_CAUSE_LENGTH).nullable(),
    confidence: investigationConfidenceSchema,
    /** Must restate supplied facts; the prompt forbids inventing new ones. */
    evidence: z.array(z.string().trim().min(1).max(MAX_EVIDENCE_LENGTH)).max(MAX_EVIDENCE_ITEMS),
    recommendedActions: z
      .array(z.string().trim().min(1).max(MAX_ACTION_LENGTH))
      .max(MAX_ACTION_ITEMS),
    insufficientData: z.boolean(),
  })
  .strict();

export type ValidatedSyncDiagnosis = z.infer<typeof syncDiagnosisSchema>;

/**
 * Post-validation guardrails the schema alone cannot express.
 *
 * A model that declares `insufficientData` and then names a cause anyway is
 * the exact failure this feature exists to prevent, so the declaration wins:
 * the cause is dropped rather than the whole response rejected. Likewise a
 * confident-sounding answer that cites nothing is demoted rather than trusted.
 */
export function applyDiagnosisGuardrails(
  diagnosis: ValidatedSyncDiagnosis,
): ValidatedSyncDiagnosis {
  if (diagnosis.insufficientData) {
    return {
      ...diagnosis,
      likelyCause: null,
      confidence: "low",
    };
  }

  if (diagnosis.evidence.length === 0 && diagnosis.confidence !== "low") {
    return { ...diagnosis, confidence: "low" };
  }

  return diagnosis;
}

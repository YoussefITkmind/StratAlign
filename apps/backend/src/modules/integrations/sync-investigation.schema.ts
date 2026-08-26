import { z } from "zod";

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
    diagnosis: z.string().trim().min(1).max(MAX_DIAGNOSIS_LENGTH),
    likelyCause: z.string().trim().min(1).max(MAX_CAUSE_LENGTH).nullable(),
    confidence: investigationConfidenceSchema,
    evidence: z.array(z.string().trim().min(1).max(MAX_EVIDENCE_LENGTH)).max(MAX_EVIDENCE_ITEMS),
    recommendedActions: z.array(z.string().trim().min(1).max(MAX_ACTION_LENGTH)).max(MAX_ACTION_ITEMS),
    insufficientData: z.boolean(),
  })
  .strict();

export type ValidatedSyncDiagnosis = z.infer<typeof syncDiagnosisSchema>;

export function applyDiagnosisGuardrails(diagnosis: ValidatedSyncDiagnosis): ValidatedSyncDiagnosis {
  if (diagnosis.insufficientData) {
    return { ...diagnosis, likelyCause: null, confidence: "low" };
  }
  if (diagnosis.evidence.length === 0 && diagnosis.confidence !== "low") {
    return { ...diagnosis, confidence: "low" };
  }
  return diagnosis;
}

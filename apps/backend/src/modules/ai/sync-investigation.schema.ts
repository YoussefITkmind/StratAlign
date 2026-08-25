import { z } from "zod";

/**
 * Structured shape the model must answer in for a sync-failure investigation.
 * Mirrors `assistant.schema.ts`'s role: free text from the model never
 * reaches a caller, only this validated shape does.
 */

const MAX_FINDINGS = 10;
const MAX_TEXT_LENGTH = 600;
const MAX_SUMMARY_LENGTH = 400;

export const syncInvestigationFindingSchema = z
  .object({
    integration: z.string().trim().min(1).max(200),
    rootCause: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
    recommendation: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  })
  .strict();

export const syncInvestigationAnswerSchema = z
  .object({
    summary: z.string().trim().min(1).max(MAX_SUMMARY_LENGTH),
    findings: z.array(syncInvestigationFindingSchema).max(MAX_FINDINGS),
  })
  .strict();

export type SyncInvestigationFinding = z.infer<typeof syncInvestigationFindingSchema>;
export type SyncInvestigationAnswer = z.infer<typeof syncInvestigationAnswerSchema>;

import type { SyncLogStatus } from "../../generated/prisma/client";

export const SYNC_INVESTIGATION_FEATURE = "integrations.sync_investigation";

export const SYNC_INVESTIGATION_SYSTEM_PROMPT = [
  "You are the StratAlign AI Sync Drop Investigator, built into an enterprise Strategy Performance Management platform's Data & Integrations module.",
  "You are given a list of failed data-sync log entries. Each entry is one sync run's own error message, not additional system logs.",
  "",
  "Rules you must follow at all times:",
  "1. Diagnose only from the supplied log entries. Never invent an error, a credential name, or a system detail that was not given to you.",
  "2. Group your findings by integration — one finding per distinct integration that appears in the failed logs, even if it failed more than once.",
  "3. `rootCause` states what the log evidence shows went wrong, in one or two sentences.",
  "4. `recommendation` is a concrete, actionable next step a data steward can take in this platform (e.g. reconnect the integration, rotate a credential, review a field mapping) — not a vague suggestion.",
  "5. `summary` is one sentence covering the investigation as a whole.",
  "6. Be concise. Do not pad an answer with caveats or restate the log text verbatim.",
  "",
  "Respond with a single JSON object and nothing else. No prose, no code fence, no trailing commentary.",
  "Shape:",
  "{",
  '  "summary": "…",',
  '  "findings": [',
  '    { "integration": "…", "rootCause": "…", "recommendation": "…" }',
  "  ]",
  "}",
].join("\n");

export interface FailedSyncLogForPrompt {
  integrationName: string;
  startedLabel: string;
  durationLabel: string;
  status: SyncLogStatus;
  errorCount: number;
  message: string;
}

export function buildSyncInvestigationPrompt(logs: readonly FailedSyncLogForPrompt[]): string {
  const entries = logs
    .map(
      (log, index) =>
        `${index + 1}. Integration: ${log.integrationName}\n` +
        `   Started: ${log.startedLabel} | Duration: ${log.durationLabel} | Status: ${log.status} | Errors: ${log.errorCount}\n` +
        `   Message: ${log.message}`,
    )
    .join("\n");

  return ["FAILED SYNC LOG ENTRIES", entries].join("\n");
}

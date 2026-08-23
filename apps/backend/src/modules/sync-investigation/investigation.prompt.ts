import type { SyncInvestigationContext } from "./sync-investigation.types";
import type { VolumeAnomalyEvidence } from "./volume-anomaly";

export const INVESTIGATION_FEATURE = "sync-logs.ai-investigation";

export const INVESTIGATION_SYSTEM_PROMPT = [
  "You are investigating a single data sync event inside an enterprise strategy performance platform.",
  "You explain the likely cause of what happened in plain language and recommend practical next steps. You never take any action yourself — a human decides what to do next.",
  "",
  "Rules you must follow:",
  "1. Use only the evidence supplied to you below. Never invent organisational facts — no systems, credentials, teams, schedules, or historical results that were not given to you.",
  "2. Clearly separate confirmed evidence (what the data shows) from your own inference (your explanation of why it happened).",
  "3. If the supplied evidence is too sparse to determine a likely cause, set insufficientData to true, leave likelyCause null, and say in the diagnosis what additional information would be needed.",
  "4. Never state an inferred cause as if it were a fact. Prefer language like 'likely' or 'this suggests' over asserting certainty.",
  "5. Recommended next steps must be grounded in the evidence — do not pad the list with generic advice unrelated to what actually happened on this run.",
  "6. `confidence` is your own 0-to-1 estimate that your diagnosis is correct. Use the full range honestly; a low-evidence case should score low.",
  "",
  "Respond with a single JSON object and nothing else. No prose, no code fence, no trailing commentary.",
].join("\n");

function describeVolume(volume: VolumeAnomalyEvidence): string {
  if (!volume.hasHistoricalData) {
    return "(no successful run history for this source — nothing to compare against)";
  }

  const lines = [
    `previous successful average: ${volume.previousSuccessfulAverage?.toFixed(1) ?? "n/a"}`,
    `most recent successful volume: ${volume.mostRecentSuccessfulVolume ?? "n/a"}`,
    `recent successful volumes (newest first): ${volume.previousSuccessfulVolumes.join(", ")}`,
  ];

  if (volume.percentDrop !== null) {
    lines.push(
      volume.percentDrop >= 0
        ? `drop vs. recent average: ${volume.percentDrop.toFixed(1)}%${volume.isSignificantDrop ? " (significant)" : ""}`
        : `this run is ${Math.abs(volume.percentDrop).toFixed(1)}% above the recent average`,
    );
  }

  return lines.join("\n");
}

/**
 * Builds the task message. Every value here comes from `SyncInvestigationContext`,
 * assembled server-side from `SyncRunReader` and `computeVolumeAnomaly` — nothing
 * on this page originates in a request body, so the prompt cannot be steered by
 * a caller.
 */
export function buildInvestigationPrompt(context: SyncInvestigationContext): string {
  const { syncRun, volumeAnomaly } = context;

  return [
    "CURRENT SYNC",
    `id: ${syncRun.id}`,
    `source: ${syncRun.sourceName} (${syncRun.sourceKey})`,
    `status: ${syncRun.status}`,
    `started at: ${syncRun.startedAt.toISOString()}`,
    `completed at: ${syncRun.completedAt ? syncRun.completedAt.toISOString() : "(not completed)"}`,
    `records processed: ${syncRun.recordsProcessed ?? "(unknown)"}`,
    `records created: ${syncRun.recordsCreated ?? "(unknown)"}`,
    `records updated: ${syncRun.recordsUpdated ?? "(unknown)"}`,
    `records failed: ${syncRun.recordsFailed ?? "(unknown)"}`,
    "",
    "HISTORICAL VOLUME",
    describeVolume(volumeAnomaly),
    "",
    "LOGS / ERRORS",
    `error code: ${syncRun.errorCode ?? "(none recorded)"}`,
    `error message: ${syncRun.errorMessage ?? "(none recorded)"}`,
    `log excerpt: ${syncRun.logExcerpt ?? "(none available)"}`,
    "",
    "INTEGRATION CONTEXT",
    `source identifier: ${syncRun.sourceKey}`,
    `source name: ${syncRun.sourceName}`,
    "",
    "INVESTIGATION TASK",
    "Explain the likely cause of this sync's outcome in plain language, distinguishing evidence from inference. If the evidence above is too sparse to support a cause, say so explicitly instead of guessing.",
    "",
    "OUTPUT REQUIREMENTS",
    "{",
    '  "diagnosis": "plain-language explanation of what likely happened",',
    '  "likelyCause": "short label for the cause, or null if insufficientData is true",',
    '  "recommendedNextSteps": ["…"],',
    '  "confidence": 0.0,',
    '  "insufficientData": false,',
    '  "evidence": ["specific facts from above that support the diagnosis"]',
    "}",
    "",
    "Omit no field. Return an empty recommendedNextSteps array only if you genuinely have nothing actionable to suggest.",
  ].join("\n");
}

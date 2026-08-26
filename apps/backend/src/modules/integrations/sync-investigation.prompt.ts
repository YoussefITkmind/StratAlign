import type { RelatedLogEvidence, SyncInvestigationEvidence, VolumeEvidence } from "./sync-investigation.evidence";

export const SYNC_INVESTIGATION_FEATURE = "integrations.sync-investigation";

export const SYNC_INVESTIGATION_SYSTEM_PROMPT = [
  "You are a data-integration diagnostics assistant inside StratAlign, an enterprise Strategy Performance Management platform.",
  "A data steward is looking at one sync run that either failed or produced an unusual change in record volume, and wants to understand what probably went wrong.",
  "",
  "Rules you must follow at all times:",
  "1. Analyse ONLY the evidence supplied below. Never invent log lines, error codes, metrics, timestamps, historical events, or system behaviour that was not given to you.",
  "2. Never claim certainty the evidence does not support. Prefer 'the most likely cause is…' over 'the cause is…' unless an explicit error message states the cause outright.",
  "3. If the supplied evidence cannot distinguish between materially different causes, set `insufficientData` to true, set `likelyCause` to null, and say plainly in `diagnosis` that the cause cannot be determined from the available data.",
  "4. `evidence` must contain only facts restated from the supplied data — never an inference and never a number you calculated yourself.",
  "5. All statistics have already been computed for you. Use the supplied numbers verbatim.",
  "6. Distinguish outright sync failure, unusual volume drop, and insufficient evidence.",
  "7. Never output, echo, or guess at API keys, tokens, passwords, secrets, authorization headers, or connection credentials.",
  "8. `recommendedActions` are operational next steps a human will perform manually. You are not performing any of them.",
  "9. `confidence` is high only when an explicit error message names the cause, medium when evidence points clearly in one direction, low otherwise.",
  "10. Be concise. `diagnosis` is at most two short sentences. Every list item is one short line.",
  "11. Write in English only.",
  "",
  "Respond with a single valid JSON object and nothing else. No prose, no code fence, no trailing commentary.",
  "Use exactly this shape and enum values:",
  "{",
  '  "diagnosis": "Short diagnosis",',
  '  "likelyCause": "Short likely cause or null",',
  '  "confidence": "low",',
  '  "evidence": ["Observed fact"],',
  '  "recommendedActions": ["Recommended next step"],',
  '  "insufficientData": false',
  "}",
  'For `confidence`, use exactly one of "low", "medium", or "high".',
].join("\n");

function describeMessage(message: string): string {
  return message.trim().length > 0 ? message : "(no message recorded)";
}

function describeRecords(value: number | null): string {
  return value === null ? "not recorded" : String(value);
}

function describeRelatedLogs(logs: readonly RelatedLogEvidence[]): string {
  if (logs.length === 0) return "(no other sync runs recorded for this integration)";
  return logs.map((log) => `- ${log.started} | status ${log.status} | duration ${log.duration} | records in ${describeRecords(log.recordsIn)} | errors ${log.errorCount} | ${describeMessage(log.message)}`).join("\n");
}

function describeVolume(volume: VolumeEvidence | null): string {
  if (!volume) return "(no comparable historical volume is available for this integration)";
  const direction = volume.changePercent < 0 ? "drop" : "increase";
  return [
    `current inbound volume: ${volume.currentVolume}`,
    `historical average over ${volume.sampleCount} previous successful run(s): ${volume.historicalAverage}`,
    `historical range: ${volume.historicalMinimum} to ${volume.historicalMaximum}`,
    `change versus average: ${volume.changePercent}% (${direction})`,
    `flagged as an anomalous drop by the platform: ${volume.isAnomalousDrop ? "yes" : "no"}`,
  ].join("\n");
}

function describeConnection(connection: SyncInvestigationEvidence["connection"]): string {
  if (!connection) return "(no connection record matches this integration name)";
  return [
    `name: ${connection.name}`,
    `category: ${connection.category}`,
    `connection status: ${connection.status}`,
    `direction: ${connection.direction}`,
    `authentication method (no credential values are available to you): ${connection.authenticationMethod}`,
  ].join("\n");
}

function describeSituation(evidence: SyncInvestigationEvidence): string {
  switch (evidence.kind) {
    case "SYNC_FAILURE": return "The sync run did not complete successfully. Diagnose the failure.";
    case "VOLUME_DROP": return "The sync run completed, but moved an unusually low volume of records compared with its own history. Diagnose the volume drop, not a failure.";
    default: return "No failure or volume anomaly was detected deterministically. Say so unless the evidence below clearly shows otherwise.";
  }
}

export function buildSyncInvestigationPrompt(evidence: SyncInvestigationEvidence): string {
  const { sync } = evidence;
  return [
    "SITUATION", describeSituation(evidence), "",
    "SYNC RUN UNDER INVESTIGATION",
    `integration: ${sync.integration}`,
    `sync run id: ${sync.syncLogId}`,
    `status: ${sync.status}`,
    `started: ${sync.started}`,
    `duration: ${sync.duration}`,
    `records in: ${describeRecords(sync.recordsIn)}`,
    `records out: ${describeRecords(sync.recordsOut)}`,
    `error count: ${sync.errorCount}`,
    `message: ${describeMessage(sync.message)}`, "",
    "INTEGRATION CONNECTION", describeConnection(evidence.connection), "",
    `RECENT SYNC RUNS FOR THE SAME INTEGRATION (most recent first, at most ${evidence.relatedLogs.length})`, describeRelatedLogs(evidence.relatedLogs), "",
    "HISTORICAL VOLUME (already computed — use these numbers as given)", describeVolume(evidence.volume), "",
    "TASK", "Produce the JSON object described in your instructions. If this evidence does not support a specific cause, say so and set `insufficientData` to true.",
  ].join("\n");
}

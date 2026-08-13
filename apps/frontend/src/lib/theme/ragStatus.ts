/**
 * Shared RAG (red/amber/green) status tokens — the single source of truth for
 * status color/label used by both Master Scorecard and KPI Detail. Mirrors the
 * backend's real vocabulary (`RagStatus` in scorecard.service.ts, produced by
 * `rag_aggregation` rules — see packages/rules/src/schemas/rag-aggregation.ts)
 * so a status computed once server-side renders identically everywhere it's
 * shown, rather than each screen inventing its own color mapping.
 *
 * Individual KPI status (StatusResult.status) is a free-text threshold-rule
 * band label (e.g. "On Track" / "At Risk" / "Off Track") rather than this
 * formal enum — normalizeRagStatus() folds that label into the same three
 * buckets the same way scorecard.service.ts's normalizeStatus() does.
 */
export type RagStatus = "on_track" | "watch" | "off_track";

export const RAG_STATUS_ORDER: readonly RagStatus[] = ["on_track", "watch", "off_track"];

export const RAG_STATUS_TOKENS: Record<
  RagStatus,
  { label: string; badgeBg: string; badgeText: string; dot: string; bar: string; text: string }
> = {
  on_track: { label: "On Track", badgeBg: "bg-emerald-50", badgeText: "text-emerald-700", dot: "bg-emerald-500", bar: "bg-emerald-500", text: "text-emerald-600" },
  watch: { label: "Watch", badgeBg: "bg-amber-50", badgeText: "text-amber-700", dot: "bg-amber-500", bar: "bg-amber-500", text: "text-amber-600" },
  off_track: { label: "Off Track", badgeBg: "bg-red-50", badgeText: "text-red-700", dot: "bg-red-500", bar: "bg-red-500", text: "text-red-600" },
};

export const UNKNOWN_STATUS_TOKENS = { label: "No computed status", badgeBg: "bg-gray-50", badgeText: "text-gray-500", dot: "bg-gray-300", bar: "bg-gray-300", text: "text-gray-500" };

/** Folds a free-text threshold-rule band label (or an already-canonical RagStatus) into the shared enum. */
export function normalizeRagStatus(value: string | null | undefined): RagStatus | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[ -]+/g, "_");
  if (normalized === "on_track" || normalized === "watch" || normalized === "off_track") return normalized;
  return null;
}

export function ragStatusTokens(value: string | null | undefined) {
  const status = normalizeRagStatus(value);
  return status ? RAG_STATUS_TOKENS[status] : UNKNOWN_STATUS_TOKENS;
}

/** Worst-of aggregation for rolling several statuses up into one (mirrors the rag_aggregation "worst_child_wins" method). */
export function worstRagStatus(statuses: Array<RagStatus | null | undefined>): RagStatus | null {
  const present = statuses.filter((status): status is RagStatus => status != null);
  if (present.length === 0) return null;
  for (const candidate of ["off_track", "watch", "on_track"] as const) {
    if (present.includes(candidate)) return candidate;
  }
  return null;
}

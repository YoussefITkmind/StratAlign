import type { DiffRendererProps } from "./types";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export default function ValueGateDiff({ before, after, impactSummary }: DiffRendererProps) {
  const from = record(before);
  const to = record(after);
  const impact = record(impactSummary);

  return (
    <div className="space-y-3" data-testid="value-gate-diff">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">From stage</p>
          <p className="mt-1 text-sm font-semibold text-gray-700">{String(from.stage ?? "—")}</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">Requested stage</p>
          <p className="mt-1 text-sm font-semibold text-blue-800">{String(to.stage ?? "—")}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Gate criteria</p>
          <p className="mt-1 text-sm font-semibold text-amber-800">{String(to.criteriaStatus ?? "pending")}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Committee decision required. This gate cannot auto-advance.
        {Array.isArray(impact.decisionOptions) ? ` Options: ${impact.decisionOptions.join(", ")}.` : ""}
      </p>
    </div>
  );
}

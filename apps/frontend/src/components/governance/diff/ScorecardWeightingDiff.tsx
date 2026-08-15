"use client";

import { trpc } from "@/lib/trpc/client";
import type { DiffRendererProps } from "./types";

interface WeightingChange { perspectiveWeights?: Record<string, number>; scoringFormulaId?: string; activeFrom?: string }
interface WeightingImpact { currentScore: number | null; proposedScore: number; delta: number | null }

/** Custom renderer for scorecard_weighting cases (Prompt 3.1): a per-perspective before/after/delta table plus the overall score delta, resolving perspective names from the real scorecard. */
export default function ScorecardWeightingDiff({ entityId, before, after, impactSummary }: DiffRendererProps) {
  const scorecardQuery = trpc.scorecard.get.useQuery({ scorecardId: entityId }, { enabled: /^[0-9a-f-]{36}$/i.test(entityId) });
  const perspectives = (scorecardQuery.data as { perspectives?: Array<{ id: string; nameEn: string }> } | undefined)?.perspectives ?? [];
  const nameFor = (id: string) => perspectives.find((p) => p.id === id)?.nameEn ?? id;

  const b = (before ?? {}) as WeightingChange;
  const a = (after ?? {}) as WeightingChange;
  const impact = impactSummary as WeightingImpact | undefined;
  const beforeWeights = b.perspectiveWeights ?? {};
  const afterWeights = a.perspectiveWeights ?? {};
  const perspectiveIds = [...new Set([...Object.keys(beforeWeights), ...Object.keys(afterWeights)])];

  return (
    <div data-testid="scorecard-weighting-diff" className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400">
              <th className="py-1 pr-3 font-medium">Perspective</th>
              <th className="py-1 pr-3 font-medium">Before weight</th>
              <th className="py-1 pr-3 font-medium">After weight</th>
              <th className="py-1 font-medium">Δ</th>
            </tr>
          </thead>
          <tbody>
            {perspectiveIds.map((id) => {
              const beforeValue = beforeWeights[id];
              const afterValue = afterWeights[id];
              const delta = beforeValue != null && afterValue != null ? afterValue - beforeValue : null;
              return (
                <tr key={id} className="border-t border-gray-100">
                  <td className="py-1 pr-3 font-medium text-gray-700">{nameFor(id)}</td>
                  <td className="py-1 pr-3 text-gray-600">{beforeValue ?? "—"}%</td>
                  <td className="py-1 pr-3 font-medium text-gray-900">{afterValue ?? "—"}%</td>
                  <td className={`py-1 ${delta == null ? "text-gray-400" : delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-gray-500"}`}>
                    {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {impact && (
        <p data-testid="scorecard-weighting-score-delta" className="text-xs text-gray-600">
          Overall score: {impact.currentScore ?? "—"}% → <span className="font-semibold text-gray-900">{Math.round(impact.proposedScore)}%</span>
          {impact.delta != null && ` (${impact.delta > 0 ? "+" : ""}${impact.delta})`}
        </p>
      )}
    </div>
  );
}

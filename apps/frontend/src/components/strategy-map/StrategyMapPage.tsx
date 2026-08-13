"use client";

import Link from "next/link";
import { Map as MapIcon, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

interface ScorecardRow { id: string; nameEn: string; nameAr: string }

/**
 * Real strategy-map gallery: one entry per real scorecard (trpc.scorecard.list),
 * each opening its real published map / editable draft in EditableMapCanvas.tsx
 * at /strategy-maps/[id]. The mock multi-map tab gallery with its own local
 * "connect mode" editing (still real StrategyNode data, not the fixture used
 * here previously) was dropped rather than kept as a second, disconnected
 * editing surface — EditableMapCanvas already owns real drafting, ApprovalCase
 * submission, and publish for a scorecard's map.
 */
export default function StrategyMapPage() {
  const scorecardsQuery = trpc.scorecard.list.useQuery();
  const scorecards = (scorecardsQuery.data as ScorecardRow[] | undefined) ?? [];

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white">
          <MapIcon className="h-4 w-4 text-gray-500" />
        </span>
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">Strategy Maps</h1>
          <p className="text-sm text-gray-500">Published and draft strategy maps for each real scorecard.</p>
        </div>
      </div>

      {scorecardsQuery.error && <p role="alert" className="mb-3 text-sm text-red-600">{scorecardsQuery.error.message}</p>}

      <div data-testid="strategy-map-gallery" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {scorecards.map((scorecard) => (
          <Link
            key={scorecard.id}
            href={`/strategy-maps/${scorecard.id}`}
            data-testid={`open-map-canvas-${scorecard.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300"
          >
            <span className="truncate text-sm font-medium text-gray-800">{scorecard.nameEn}</span>
            <Pencil className="h-4 w-4 shrink-0 text-gray-400" />
          </Link>
        ))}
        {scorecards.length === 0 && !scorecardsQuery.isLoading && (
          <p className="text-sm text-gray-400">No scorecards yet.</p>
        )}
      </div>
    </div>
  );
}

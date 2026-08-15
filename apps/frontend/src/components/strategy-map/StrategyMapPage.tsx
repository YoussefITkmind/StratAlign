"use client";

import Link from "next/link";
import { Map as MapIcon, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

interface ScorecardRow {
  id: string;
  nameEn: string;
  nameAr: string;
}

export default function StrategyMapPage() {
  const scorecardsQuery = trpc.scorecard.list.useQuery();
  const scorecards = (scorecardsQuery.data as ScorecardRow[] | undefined) ?? [];

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6" data-testid="strategy-map-gallery">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white">
          <MapIcon className="h-5 w-5 text-gray-500" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Strategy Maps</h1>
          <p className="text-sm text-gray-500">Open the live map for a balanced scorecard.</p>
        </div>
      </div>

      {scorecardsQuery.isLoading && <p className="text-sm text-gray-500">Loading strategy maps…</p>}
      {scorecardsQuery.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{scorecardsQuery.error.message}</p>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {scorecards.map((scorecard) => (
          <Link
            key={scorecard.id}
            href={`/strategy-maps/${scorecard.id}`}
            data-testid={`open-map-canvas-${scorecard.id}`}
            className="group flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-gray-900">{scorecard.nameEn}</h2>
              <p dir="rtl" className="mt-1 truncate text-sm text-gray-500">{scorecard.nameAr}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-1 group-hover:text-blue-600 rtl:rotate-180" />
          </Link>
        ))}
      </div>

      {!scorecardsQuery.isLoading && scorecards.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-500">No scorecards are available yet.</div>
      )}
    </div>
  );
}

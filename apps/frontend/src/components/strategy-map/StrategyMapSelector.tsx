"use client";

import { ChevronDown, Map as MapIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";

interface ScorecardOption {
  id: string;
  nameEn: string;
}

interface BalancedOption {
  id: string;
}

export default function StrategyMapSelector({ scorecardId }: { scorecardId: string }) {
  const router = useRouter();
  const scorecardsQuery = trpc.scorecard.list.useQuery();
  const balancedQuery = trpc.scorecard.balanced.list.useQuery();

  const scorecards = (scorecardsQuery.data as ScorecardOption[] | undefined) ?? [];
  const balanced = (balancedQuery.data as BalancedOption[] | undefined) ?? [];

  const maps = useMemo(() => {
    const balancedIds = new Set(balanced.map((item) => item.id));
    return scorecards.filter(
      (item) => !balancedIds.has(item.id) && !item.nameEn.startsWith("E2E "),
    );
  }, [balanced, scorecards]);

  if (maps.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
        <MapIcon className="h-4 w-4 text-sky-600" />
      </span>
      <div className="relative min-w-[260px] max-w-[420px]">
        <select
          aria-label="Select strategy map"
          data-testid="strategy-map-selector"
          value={scorecardId}
          onChange={(event) => router.push(`/strategy-maps/${event.target.value}`)}
          className="w-full appearance-none rounded-xl border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm font-medium text-gray-800 outline-none transition hover:bg-gray-50 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
        >
          {maps.map((map) => (
            <option key={map.id} value={map.id}>
              {map.nameEn}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
      <span className="text-xs text-gray-400">
        {maps.length} maps
      </span>
    </div>
  );
}

"use client";

import { ChevronDown } from "lucide-react";
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

  const current = scorecards.find((item) => item.id === scorecardId);
  const options = maps.length > 0
    ? maps
    : current
      ? [current]
      : [{ id: scorecardId, nameEn: "Strategy Map" }];

  return (
    <div className="absolute left-14 top-3 z-30">
      <div className="relative min-w-[240px] max-w-[340px]">
        <select
          aria-label="Select strategy map"
          data-testid="strategy-map-selector"
          value={scorecardId}
          onChange={(event) => router.push(`/strategy-maps/${event.target.value}`)}
          className="w-full appearance-none rounded-full border border-[#063b4d] bg-[#063b4d] py-2 pl-4 pr-10 text-sm font-medium text-white outline-none transition hover:bg-[#0a4a60] focus:ring-2 focus:ring-sky-300"
        >
          {options.map((map) => (
            <option key={map.id} value={map.id} className="bg-white text-gray-900">
              {map.nameEn}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/80" />
      </div>
    </div>
  );
}

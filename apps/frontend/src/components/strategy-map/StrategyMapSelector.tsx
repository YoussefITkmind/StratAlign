"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";

interface BalancedScorecardOption {
  id: string;
  name: string;
  nameEn?: string;
  isBalancedScorecard?: boolean;
}

export default function StrategyMapSelector({ scorecardId }: { scorecardId: string }) {
  const router = useRouter();
  const balancedQuery = trpc.scorecard.balanced.list.useQuery();

  const options = useMemo(() => {
    const rows = (balancedQuery.data as BalancedScorecardOption[] | undefined) ?? [];
    return rows
      .filter((item) => item.isBalancedScorecard !== false && !item.name.startsWith("E2E "))
      .map((item) => ({ id: item.id, name: item.nameEn ?? item.name }));
  }, [balancedQuery.data]);

  const hasCurrent = options.some((item) => item.id === scorecardId);
  const selectValue = hasCurrent ? scorecardId : "";

  return (
    <div className="absolute left-14 top-3 z-30">
      <div className="relative min-w-[240px] max-w-[340px]">
        <select
          aria-label="Select scorecard strategy map"
          data-testid="strategy-map-selector"
          value={selectValue}
          onChange={(event) => {
            if (event.target.value) router.push(`/strategy-maps/${event.target.value}`);
          }}
          className="w-full appearance-none rounded-full border border-[#063b4d] bg-[#063b4d] py-2 pl-4 pr-10 text-sm font-medium text-white outline-none transition hover:bg-[#0a4a60] focus:ring-2 focus:ring-sky-300"
        >
          {!hasCurrent && <option value="">Select scorecard</option>}
          {options.map((scorecard) => (
            <option key={scorecard.id} value={scorecard.id} className="bg-white text-gray-900">
              {scorecard.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/80" />
      </div>
    </div>
  );
}

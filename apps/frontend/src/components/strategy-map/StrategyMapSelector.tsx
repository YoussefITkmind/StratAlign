"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    const rows = (balancedQuery.data as BalancedScorecardOption[] | undefined) ?? [];
    return rows
      .filter((item) => item.isBalancedScorecard !== false && !item.name.startsWith("E2E "))
      .map((item) => ({ id: item.id, name: item.nameEn ?? item.name }));
  }, [balancedQuery.data]);

  const current = options.find((item) => item.id === scorecardId);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute left-14 top-3 z-30">
      <div className="relative w-[270px] max-w-[calc(100vw-7rem)]">
        <button
          type="button"
          aria-label="Select scorecard strategy map"
          aria-haspopup="listbox"
          aria-expanded={open}
          data-testid="strategy-map-selector"
          onClick={() => setOpen((value) => !value)}
          className={`flex w-full items-center justify-between gap-3 rounded-full border px-4 py-2 text-left text-sm font-semibold shadow-sm outline-none transition ${
            open
              ? "border-sky-400 bg-[#063b4d] text-white ring-2 ring-sky-200"
              : "border-[#063b4d] bg-[#063b4d] text-white hover:bg-[#0a4a60]"
          }`}
        >
          <span className="truncate">{current?.name ?? "Select scorecard"}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-white/80 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label="Scorecard strategy maps"
            className="absolute left-0 top-[calc(100%+8px)] z-50 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.18)]"
          >
            <div className="max-h-[330px] overflow-y-auto py-0.5">
              {options.map((scorecard) => {
                const selected = scorecard.id === scorecardId;
                return (
                  <button
                    key={scorecard.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setOpen(false);
                      if (!selected) router.push(`/strategy-maps/${scorecard.id}`);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      selected
                        ? "bg-sky-50 font-semibold text-[#063b4d]"
                        : "font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    <span className="truncate">{scorecard.name}</span>
                    {selected && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}

              {!balancedQuery.isLoading && options.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-slate-400">No scorecards available.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

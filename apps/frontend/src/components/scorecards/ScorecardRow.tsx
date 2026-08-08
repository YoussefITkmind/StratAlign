"use client";

import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { Scorecard } from "@/types/scorecard";
import { SCORECARD_STATUS_CONFIG, scoreColor } from "@/lib/scorecardConfig";
import PerspectiveRow from "./PerspectiveRow";

interface Props {
  scorecard: Scorecard;
  expandedIds: Set<string>;
  forceExpanded: boolean;
  onToggle: (id: string) => void;
}

export default function ScorecardRow({ scorecard, expandedIds, forceExpanded, onToggle }: Props) {
  const isOpen = forceExpanded || expandedIds.has(scorecard.id);
  const statusCfg = SCORECARD_STATUS_CONFIG[scorecard.status];
  const color = scoreColor(scorecard.score);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button onClick={() => onToggle(scorecard.id)} className="flex w-full items-center justify-between px-4 py-4 text-left hover:bg-gray-50">
        <div className="flex min-w-0 items-center gap-3">
          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <BookOpen className="h-4 w-4 text-blue-600" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold text-gray-900">{scorecard.name}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusCfg.badgeBg} ${statusCfg.badgeText}`}>
                {statusCfg.label}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-400">
              {scorecard.department} · {scorecard.period} · {scorecard.ownerName}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full rounded-full ${color.bar}`} style={{ width: `${scorecard.score}%` }} />
          </div>
          <span className={`w-10 text-right text-sm font-semibold ${color.text}`}>{scorecard.score}%</span>
        </div>
      </button>

      {isOpen && (
        <div className="ml-8 border-l border-gray-100 pb-1">
          {scorecard.perspectives.map((p) => (
            <PerspectiveRow
              key={p.id}
              perspective={p}
              expanded={forceExpanded || expandedIds.has(p.id)}
              onToggle={() => onToggle(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

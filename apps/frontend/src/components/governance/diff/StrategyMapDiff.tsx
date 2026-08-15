import type { DiffRendererProps } from "./types";

interface MapLinkChange { id?: string; fromObjectiveId: string; toObjectiveId: string; strength: string }

function linkKey(link: MapLinkChange) {
  return `${link.fromObjectiveId}->${link.toObjectiveId}`;
}

/** Custom renderer for strategy_map cases (Prompt 3.3): which links are being added, removed, or kept between the currently published map and the proposed one. */
export default function StrategyMapDiff({ before, after }: DiffRendererProps) {
  const beforeLinks = (Array.isArray(before) ? before : []) as MapLinkChange[];
  const afterLinks = (Array.isArray(after) ? after : []) as MapLinkChange[];
  const beforeKeys = new Set(beforeLinks.map(linkKey));
  const afterKeys = new Set(afterLinks.map(linkKey));

  const added = afterLinks.filter((l) => !beforeKeys.has(linkKey(l)));
  const removed = beforeLinks.filter((l) => !afterKeys.has(linkKey(l)));
  const kept = afterLinks.filter((l) => beforeKeys.has(linkKey(l)));

  return (
    <div data-testid="strategy-map-diff" className="flex flex-col gap-2 text-xs">
      {added.length === 0 && removed.length === 0 && kept.length === 0 && <p className="text-gray-400">No proposed links.</p>}
      {added.map((l) => (
        <p key={`added-${linkKey(l)}`} className="text-emerald-700">+ Add link {l.fromObjectiveId} → {l.toObjectiveId} ({l.strength})</p>
      ))}
      {removed.map((l) => (
        <p key={`removed-${linkKey(l)}`} className="text-red-600">− Remove link {l.fromObjectiveId} → {l.toObjectiveId} ({l.strength})</p>
      ))}
      {kept.map((l) => (
        <p key={`kept-${linkKey(l)}`} className="text-gray-500">= Keep link {l.fromObjectiveId} → {l.toObjectiveId} ({l.strength})</p>
      ))}
    </div>
  );
}

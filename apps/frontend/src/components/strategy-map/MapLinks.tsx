import { ArrowRight, Trash2 } from "lucide-react";
import type { LinkStrength } from "@/lib/strategyMapVisualConfig";

export interface MapLinkRow {
  id: string;
  fromObjectiveId: string;
  toObjectiveId: string;
  strength: LinkStrength;
}

export default function MapLinks({
  links,
  objectiveName,
  editable,
  onRemove,
}: {
  links: MapLinkRow[];
  objectiveName: (id: string) => string;
  editable: boolean;
  onRemove?: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="map-links-panel">
      <h2 className="mb-3 font-semibold text-gray-900">Cause-and-effect links</h2>
      <div className="space-y-2">
        {links.map((link) => (
          <div key={link.id} data-testid={`map-link-${link.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{objectiveName(link.fromObjectiveId)}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400 rtl:rotate-180" />
              <span className="truncate">{objectiveName(link.toObjectiveId)}</span>
              <span className="rounded bg-white px-1.5 py-0.5 text-[10px] uppercase text-gray-500">{link.strength}</span>
            </span>
            {editable && onRemove && (
              <button type="button" aria-label="Remove link" onClick={() => onRemove(link.id)} className="text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {links.length === 0 && <p className="text-sm text-gray-400">No links on this map yet.</p>}
      </div>
    </section>
  );
}

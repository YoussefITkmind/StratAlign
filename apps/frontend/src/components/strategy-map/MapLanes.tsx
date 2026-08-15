interface Perspective { id: string; nameEn: string; nameAr: string; order: number }
export interface MapPlacement {
  perspectiveId: string;
  objectiveNodeId: string;
  objectiveNameEn: string;
  objectiveNameAr: string;
  kpiNameEn: string | null;
  status: "on_track" | "watch" | "off_track" | null;
}

const statusClass: Record<string, string> = {
  on_track: "bg-emerald-500",
  watch: "bg-amber-500",
  off_track: "bg-red-500",
};

export default function MapLanes({ perspectives, placements }: { perspectives: Perspective[]; placements: MapPlacement[] }) {
  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-slate-50 p-4" data-testid="strategy-map-canvas">
      {[...perspectives].sort((a, b) => a.order - b.order).map((perspective) => {
        const rows = placements.filter((placement) => placement.perspectiveId === perspective.id);
        return (
          <section key={perspective.id} data-testid={`perspective-lane-${perspective.id}`} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div><h2 className="font-semibold text-gray-900">{perspective.nameEn}</h2><p dir="rtl" className="text-xs text-gray-400">{perspective.nameAr}</p></div>
              <span className="text-xs text-gray-400">{rows.length} objective{rows.length === 1 ? "" : "s"}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((placement) => (
                <article key={placement.objectiveNodeId} data-testid={`map-objective-${placement.objectiveNodeId}`} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{placement.objectiveNameEn}</p>
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${placement.status ? statusClass[placement.status] : "bg-gray-300"}`} />
                  </div>
                  <p dir="rtl" className="mt-1 text-xs text-gray-500">{placement.objectiveNameAr}</p>
                  {placement.kpiNameEn && <p className="mt-2 text-xs text-gray-400">KPI: {placement.kpiNameEn}</p>}
                </article>
              ))}
              {rows.length === 0 && <p className="text-sm text-gray-400">No objectives in this perspective.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

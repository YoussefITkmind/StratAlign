import { History, Pencil, SlidersHorizontal, Link2, Archive, RotateCcw, Sparkles } from "lucide-react";
import { Kpi, VersionChangeType } from "@/types/kpi";

const CHANGE_ICON: Record<VersionChangeType, typeof History> = {
  created: Sparkles, definition: Pencil, threshold: SlidersHorizontal, alignment: Link2, retired: Archive, reactivated: RotateCcw,
};

export default function HistoryTab({ kpi }: { kpi: Kpi }) {
  const versions = [...kpi.versions].sort((a, b) => b.version - a.version);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <History className="h-4 w-4 text-gray-400" /> Version History
      </h2>
      <div className="space-y-4">
        {versions.map((v) => {
          const Icon = CHANGE_ICON[v.changeType];
          return (
            <div key={v.id} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 border-b border-gray-50 pb-4 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">v{v.version}</span>
                  <span className="text-sm text-gray-600">{v.summary}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  {v.editedBy} · {new Date(v.editedAt).toLocaleDateString()} {new Date(v.editedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

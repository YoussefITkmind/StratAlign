import { Crosshair } from "lucide-react";

export default function TargetsTabPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-10 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-300 shadow-sm">
        <Crosshair className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-medium text-gray-500">Target Authoring</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
        Real target-setting (period-by-period targets, cascading, stretch goals) arrives in a later phase.
        This panel intentionally shows no data yet — the KPI&apos;s single target value is set from the Definition tab for now.
      </p>
    </div>
  );
}

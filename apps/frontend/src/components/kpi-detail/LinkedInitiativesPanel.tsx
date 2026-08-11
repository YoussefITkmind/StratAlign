import { Rocket } from "lucide-react";

export default function LinkedInitiativesPanel() {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-6 text-center">
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-300 shadow-sm">
        <Rocket className="h-4 w-4" />
      </span>
      <p className="mt-3 text-sm font-medium text-gray-500">Linked Initiatives</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-gray-400">Initiatives arrive in a later phase — this panel will list the initiatives driving this KPI once that module is wired in.</p>
    </div>
  );
}

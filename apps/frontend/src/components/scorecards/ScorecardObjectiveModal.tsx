"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { ObjectiveStatus, Perspective, ScorecardObjective } from "@/types/scorecard";

export default function ScorecardObjectiveModal({
  objective,
  perspectives,
  defaultPerspectiveId,
  defaultOwnerName,
  busy,
  onClose,
  onSave,
}: {
  objective?: ScorecardObjective | null;
  perspectives: Perspective[];
  defaultPerspectiveId?: string;
  defaultOwnerName: string;
  busy?: boolean;
  onClose: () => void;
  onSave: (input: {
    perspectiveId: string;
    name: string;
    status: ObjectiveStatus;
    progress: number;
    ownerName: string;
    description: string | null;
    kpiSnapshotIds: string[];
  }) => void | Promise<void>;
}) {
  const existingPerspective = useMemo(
    () => objective ? perspectives.find((perspective) => perspective.objectives?.some((row) => row.id === objective.id)) : undefined,
    [objective, perspectives],
  );
  const initialPerspectiveId = existingPerspective?.id ?? defaultPerspectiveId ?? perspectives[0]?.id ?? "";
  const [perspectiveId, setPerspectiveId] = useState(initialPerspectiveId);
  const [name, setName] = useState(objective?.name ?? "");
  const [status, setStatus] = useState<ObjectiveStatus>(objective?.status ?? "not-started");
  const [progress, setProgress] = useState(objective?.progress ?? 0);
  const [ownerName, setOwnerName] = useState(objective?.ownerName ?? defaultOwnerName);
  const [description, setDescription] = useState(objective?.description ?? "");
  const [selectedKpis, setSelectedKpis] = useState<Set<string>>(new Set(objective?.linkedKpiIds ?? []));

  useEffect(() => {
    const nextPerspective = existingPerspective?.id ?? defaultPerspectiveId ?? perspectives[0]?.id ?? "";
    setPerspectiveId(nextPerspective);
    setName(objective?.name ?? "");
    setStatus(objective?.status ?? "not-started");
    setProgress(objective?.progress ?? 0);
    setOwnerName(objective?.ownerName ?? defaultOwnerName);
    setDescription(objective?.description ?? "");
    setSelectedKpis(new Set(objective?.linkedKpiIds ?? []));
  }, [defaultOwnerName, defaultPerspectiveId, existingPerspective?.id, objective, perspectives]);

  const perspective = perspectives.find((row) => row.id === perspectiveId);
  const availableKpis = perspective?.kpis ?? [];

  useEffect(() => {
    const allowed = new Set(availableKpis.map((kpi) => kpi.id));
    setSelectedKpis((previous) => new Set([...previous].filter((id) => allowed.has(id))));
  }, [perspectiveId]);

  const toggleKpi = (id: string) => {
    setSelectedKpis((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSave = Boolean(perspectiveId && name.trim() && ownerName.trim()) && !busy;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-[600px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <h2 className="text-base font-semibold text-gray-900">{objective ? "Edit Objective" : "Add Objective"}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto px-6 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-800">Objective Label</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-800">Perspective</span>
            <select value={perspectiveId} onChange={(event) => setPerspectiveId(event.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500">
              {perspectives.map((row) => <option key={row.id} value={row.id}>{row.key === "internal-process" ? "Internal Process" : row.key === "learning-growth" ? "Learning & Growth" : row.key[0]!.toUpperCase() + row.key.slice(1)}</option>)}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-medium text-gray-800">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as ObjectiveStatus)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none">
                <option value="on-track">On Track</option>
                <option value="at-risk">At Risk</option>
                <option value="off-track">Off Track</option>
                <option value="not-started">Not Started</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium text-gray-800">Owner</span>
              <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-800">Progress — {progress}%</span>
            <input type="range" min={0} max={100} value={progress} onChange={(event) => setProgress(Number(event.target.value))} className="w-full accent-sky-500" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-800">Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none" />
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-800">Linked KPIs</span>
              <span className="text-xs text-gray-400">KPIs must be in the same perspective</span>
            </div>
            {availableKpis.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-400">No KPIs exist in this perspective yet.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2">
                {availableKpis.map((kpi) => (
                  <label key={kpi.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-gray-50">
                    <input type="checkbox" checked={selectedKpis.has(kpi.id)} onChange={() => toggleKpi(kpi.id)} className="h-4 w-4 rounded border-gray-300" />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{kpi.name}</span>
                    <span className="text-xs text-gray-400">{kpi.score}%</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 px-6 py-5">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" disabled={!canSave} onClick={() => void onSave({ perspectiveId, name: name.trim(), status, progress, ownerName: ownerName.trim(), description: description.trim() || null, kpiSnapshotIds: [...selectedKpis] })} className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{objective ? "Save Changes" : "Add Objective"}</button>
        </div>
      </div>
    </div>
  );
}

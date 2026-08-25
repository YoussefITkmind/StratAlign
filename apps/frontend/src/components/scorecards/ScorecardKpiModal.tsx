"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Kpi, Perspective, ScorecardStatus } from "@/types/scorecard";

export default function ScorecardKpiModal({
  kpi,
  perspective,
  busy,
  onClose,
  onSave,
}: {
  kpi?: Kpi | null;
  perspective: Perspective;
  busy?: boolean;
  onClose: () => void;
  onSave: (input: {
    name: string;
    status: ScorecardStatus;
    ownerInitials: string;
    ownerColor: string;
    score: number;
    weight?: number;
    actual?: string;
    target?: string;
    variance?: string;
    trend?: number[];
    objectiveNodeIds: string[];
  }) => void | Promise<void>;
}) {
  const [name, setName] = useState(kpi?.name ?? "");
  const [status, setStatus] = useState<ScorecardStatus>(kpi?.status ?? "draft");
  const [ownerInitials, setOwnerInitials] = useState(kpi?.owner.initials ?? perspective.owner.initials);
  const [ownerColor] = useState(kpi?.owner.color ?? perspective.owner.color);
  const [score, setScore] = useState(kpi?.score ?? 0);
  const [weight, setWeight] = useState(kpi?.weight != null ? String(kpi.weight) : "");
  const [actual, setActual] = useState(kpi?.actual ?? "");
  const [target, setTarget] = useState(kpi?.target ?? "");
  const [variance, setVariance] = useState(kpi?.variance ?? "");
  const [selectedObjectives, setSelectedObjectives] = useState<Set<string>>(new Set(kpi?.linkedObjectiveIds ?? []));

  useEffect(() => {
    setName(kpi?.name ?? "");
    setStatus(kpi?.status ?? "draft");
    setOwnerInitials(kpi?.owner.initials ?? perspective.owner.initials);
    setScore(kpi?.score ?? 0);
    setWeight(kpi?.weight != null ? String(kpi.weight) : "");
    setActual(kpi?.actual ?? "");
    setTarget(kpi?.target ?? "");
    setVariance(kpi?.variance ?? "");
    setSelectedObjectives(new Set(kpi?.linkedObjectiveIds ?? []));
  }, [kpi, perspective.owner.initials]);

  const objectives = useMemo(() => perspective.objectives ?? [], [perspective.objectives]);

  const toggleObjective = (id: string) => {
    setSelectedObjectives((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSave = Boolean(name.trim() && ownerInitials.trim()) && !busy;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-[600px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <h2 className="text-base font-semibold text-gray-900">{kpi ? "Edit KPI" : "Add KPI"}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto px-6 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-800">KPI Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-medium text-gray-800">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as ScorecardStatus)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none">
                <option value="on-track">On Track</option>
                <option value="at-risk">At Risk</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium text-gray-800">Owner Initials</span>
              <input value={ownerInitials} maxLength={2} onChange={(event) => setOwnerInitials(event.target.value.toUpperCase())} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none" />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-medium text-gray-800">Score — {score}%</span>
              <input type="range" min={0} max={100} value={score} onChange={(event) => setScore(Number(event.target.value))} className="w-full accent-sky-500" />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium text-gray-800">Weight (%)</span>
              <input type="number" min={0} max={100} value={weight} onChange={(event) => setWeight(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Actual</span><input value={actual} onChange={(event) => setActual(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" /></label>
            <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Target</span><input value={target} onChange={(event) => setTarget(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" /></label>
            <label><span className="mb-1.5 block text-xs font-medium text-gray-600">Variance</span><input value={variance} onChange={(event) => setVariance(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" /></label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-800">Linked Objectives</span>
              <span className="text-xs text-gray-400">{perspective.key === "internal-process" ? "Internal Process" : perspective.key === "learning-growth" ? "Learning & Growth" : perspective.key[0]!.toUpperCase() + perspective.key.slice(1)}</span>
            </div>
            {objectives.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-400">No objectives exist in this perspective yet.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2">
                {objectives.map((objective) => (
                  <label key={objective.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-gray-50">
                    <input type="checkbox" checked={selectedObjectives.has(objective.id)} onChange={() => toggleObjective(objective.id)} className="h-4 w-4 rounded border-gray-300" />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{objective.name}</span>
                    <span className="text-xs text-gray-400">{objective.progress}%</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 px-6 py-5">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" disabled={!canSave} onClick={() => void onSave({ name: name.trim(), status, ownerInitials: ownerInitials.trim(), ownerColor, score, weight: weight === "" ? undefined : Number(weight), actual: actual.trim() || undefined, target: target.trim() || undefined, variance: variance.trim() || undefined, trend: kpi?.trend ?? [], objectiveNodeIds: [...selectedObjectives] })} className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{kpi ? "Save Changes" : "Add KPI"}</button>
        </div>
      </div>
    </div>
  );
}

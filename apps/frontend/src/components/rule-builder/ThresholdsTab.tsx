"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, SlidersHorizontal, CheckCircle2 } from "lucide-react";
import { Kpi, KpiStatus, RollupMethod, RuleComparator, RuleDefinition, ThresholdBand } from "@/types/kpi";
import { STATUS_CONFIG } from "@/lib/kpiConfig";
import { validateBands } from "@/lib/ruleEngine";
import { useKpiStore } from "@/components/providers/KpiStoreProvider";
import ThresholdChart from "@/components/shared/ThresholdChart";

const COMPARATORS: RuleComparator[] = [">=", ">", "<=", "<"];
const STATUSES: KpiStatus[] = ["on-track", "at-risk", "behind"];
const ROLLUP_METHODS: RollupMethod[] = ["sum", "average", "weighted", "worst-of"];

let draftCounter = 0;
function newBandId() {
  draftCounter += 1;
  return `draft-band-${draftCounter}`;
}

export default function ThresholdsTab({ kpi, rule }: { kpi: Kpi; rule: RuleDefinition }) {
  const { updateRule, publishRule, setRollup, addVersionEntry } = useKpiStore();
  const [editing, setEditing] = useState(false);
  const [draftBands, setDraftBands] = useState<ThresholdBand[]>(rule.bands);
  const [previewSynthetic, setPreviewSynthetic] = useState(false);

  const validation = useMemo(() => validateBands(draftBands, rule.direction), [draftBands, rule.direction]);

  const syntheticHistory = useMemo(() => {
    const spread = Math.abs(kpi.target) * 0.3 || 1;
    const base = new Date(2024, 0, 1).getTime();
    return [0.6, 0.8, 1, 1.15, 0.95, 1.05].map((mult, i) => ({
      period: `Sample ${i + 1}`,
      date: new Date(base + i * 30 * 86400000).toISOString(),
      value: kpi.target - spread + spread * 2 * mult * 0.5,
    }));
  }, [kpi.target]);

  const previewHistory = kpi.history.length > 0 && !previewSynthetic ? kpi.history : syntheticHistory;
  const previewRule: RuleDefinition = { ...rule, bands: draftBands };

  const startEdit = () => {
    setDraftBands(rule.bands.map((b) => ({ ...b })));
    setEditing(true);
  };

  const updateBand = (id: string, patch: Partial<ThresholdBand>) => {
    setDraftBands((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const addBand = () => {
    setDraftBands((prev) => [...prev, { id: newBandId(), label: "New Band", comparator: ">=", value: kpi.target, status: "at-risk" }]);
  };

  const removeBand = (id: string) => {
    setDraftBands((prev) => prev.filter((b) => b.id !== id));
  };

  const publish = () => {
    if (!validation.valid) return;
    updateRule(rule.id, { bands: draftBands });
    publishRule(rule.id);
    setEditing(false);
  };

  const isRollupParent = (kpi.childIds?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <SlidersHorizontal className="h-4 w-4 text-gray-400" /> Threshold Rule
          </h2>
          {!editing && (
            <button onClick={startEdit} className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              Edit Rule
            </button>
          )}
        </div>

        {!editing ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">
              {kpi.direction === "higher-better" ? "Higher is better" : "Lower is better"} Â· v{rule.version} Â· {rule.active ? "Active" : "Draft"}
            </p>
            {rule.bands.map((b) => (
              <div key={b.id} className="flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${STATUS_CONFIG[b.status].dot}`} />
                <span className="font-medium text-gray-800">{b.label}</span>
                <span className="text-gray-400">{b.comparator} {b.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-400">{kpi.direction === "higher-better" ? "Higher is better" : "Lower is better"}</p>
            <div className="space-y-2">
              {draftBands.map((band) => (
                <div key={band.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                  <input value={band.label} onChange={(e) => updateBand(band.id, { label: e.target.value })}
                    className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm outline-none focus:border-indigo-500" />
                  <select value={band.comparator} onChange={(e) => updateBand(band.id, { comparator: e.target.value as RuleComparator })}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm outline-none focus:border-indigo-500">
                    {COMPARATORS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="number" value={band.value} onChange={(e) => updateBand(band.id, { value: Number(e.target.value) })}
                    className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm outline-none focus:border-indigo-500" />
                  <select value={band.status} onChange={(e) => updateBand(band.id, { status: e.target.value as KpiStatus })}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm outline-none focus:border-indigo-500">
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                  </select>
                  <button onClick={() => removeBand(band.id)} className="ml-auto rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remove band">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addBand} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
              <Plus className="h-3.5 w-3.5" /> Add band
            </button>

            {!validation.valid && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{validation.error}</p>
            )}

            {isRollupParent && (
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Roll-up Method</p>
                <div className="flex flex-wrap gap-2">
                  {ROLLUP_METHODS.map((m) => (
                    <button key={m} onClick={() => setRollup(kpi.id, m)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${kpi.rollupMethod === m ? "border-slate-900 bg-slate-900 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                      {m.replace("-", " ")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    addVersionEntry(kpi.id, { editedBy: kpi.owner.name, editedAt: new Date().toISOString(), changeType: "threshold", summary: "Threshold rule submitted for approval." });
                    publish();
                  }}
                  disabled={!validation.valid}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Submit &amp; Publish
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Live Preview</h2>
          {kpi.history.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input type="checkbox" checked={previewSynthetic} onChange={(e) => setPreviewSynthetic(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300" />
              Preview against synthetic sample
            </label>
          )}
        </div>
        {kpi.history.length === 0 && !previewSynthetic && (
          <p className="mb-3 text-xs text-amber-600">No measurement history yet for this KPI â preview unavailable. Showing a synthetic sample instead.</p>
        )}
        <ThresholdChart history={previewHistory} rule={editing ? previewRule : rule} />
      </div>
    </div>
  );
}

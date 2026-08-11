"use client";

import { useMemo, useState } from "react";
import { X, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { Direction, Frequency, Kpi, PerspectiveKey, Unit } from "@/types/kpi";
import { PERSPECTIVE_ORDER, PERSPECTIVE_CONFIG, colorForInitials } from "@/lib/kpiConfig";
import { DOMAIN_OPTIONS, SOURCE_OPTIONS } from "@/lib/catalogConfig";
import { findSimilar } from "@/lib/similarity";
import { buildDefaultRule } from "@/lib/ruleEngine";
import { useKpiStore } from "@/components/providers/KpiStoreProvider";
import DuplicateCandidates from "./DuplicateCandidates";

const STEPS = ["Basic Info", "Definition", "Review"] as const;
const UNITS: Unit[] = ["percent", "currency", "number", "score", "days"];
const FREQS: Frequency[] = ["weekly", "monthly", "quarterly"];

interface FormState {
  nameEn: string;
  nameAr: string;
  domain: string;
  perspective: PerspectiveKey;
  department: string;
  descriptionEn: string;
  descriptionAr: string;
  unit: Unit;
  direction: Direction;
  target: number;
  baseline: number;
  frequency: Frequency;
  source: string;
  ownerName: string;
  acknowledgedDuplicates: boolean;
}

const initialState: FormState = {
  nameEn: "", nameAr: "", domain: DOMAIN_OPTIONS[0], perspective: "financial", department: "",
  descriptionEn: "", descriptionAr: "", unit: "percent", direction: "higher-better", target: 0, baseline: 0,
  frequency: "monthly", source: SOURCE_OPTIONS[0], ownerName: "", acknowledgedDuplicates: false,
};

export default function KpiCreationWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (kpiId: string) => void }) {
  const { kpis, addKpi } = useKpiStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialState);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const duplicates = useMemo(() => findSimilar(form.nameEn, kpis), [form.nameEn, kpis]);

  const step0Valid = form.nameEn.trim().length > 1 && form.department.trim().length > 0 && (duplicates.length === 0 || form.acknowledgedDuplicates);
  const step1Valid = form.descriptionEn.trim().length > 0 && form.ownerName.trim().length > 0;

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const create = () => {
    const initials = form.ownerName.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const id = `kpi-${Date.now()}`;
    const rule = buildDefaultRule(id, form.target, form.direction);
    const kpi: Kpi = {
      id, name: form.nameEn.trim(), tag: form.domain, perspective: form.perspective, department: form.department.trim(),
      owner: { initials, name: form.ownerName.trim(), color: colorForInitials(initials) },
      unit: form.unit, direction: form.direction, actual: form.baseline, target: form.target, baseline: form.baseline,
      frequency: form.frequency, approval: "draft", status: "at-risk", ruleId: rule.id, history: [], comments: [],
      title: { en: form.nameEn.trim(), ar: form.nameAr.trim() },
      description: { en: form.descriptionEn.trim(), ar: form.descriptionAr.trim() },
      domain: form.domain, source: form.source, usageCount: 0, alignedNodeIds: [], retired: false,
      versions: [{ id: `${id}-v1`, version: 1, editedBy: form.ownerName.trim(), editedAt: new Date().toISOString(), changeType: "created", summary: "KPI created via the guided wizard." }],
    };
    addKpi(kpi);
    onCreated(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New KPI</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i <= step ? "bg-slate-900 text-white" : "bg-gray-100 text-gray-400"}`}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-xs font-medium ${i <= step ? "text-gray-900" : "text-gray-400"}`}>{label}</span>
              {i < STEPS.length - 1 && <div className={`h-px flex-1 ${i < step ? "bg-slate-900" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">KPI name (English)</label>
                <input value={form.nameEn} onChange={(e) => { set("nameEn", e.target.value); set("acknowledgedDuplicates", false); }}
                  placeholder="e.g. Customer Churn Rate"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">KPI name (Arabic)</label>
                <input value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} dir="rtl" placeholder="اسم المؤشر"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
            </div>

            <DuplicateCandidates matches={duplicates} />
            {duplicates.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={form.acknowledgedDuplicates} onChange={(e) => set("acknowledgedDuplicates", e.target.checked)} />
                I&apos;ve reviewed the similar KPIs above and want to create a new one anyway.
              </label>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Perspective</label>
              <div className="grid grid-cols-4 gap-2">
                {PERSPECTIVE_ORDER.map((key) => {
                  const cfg = PERSPECTIVE_CONFIG[key];
                  const on = form.perspective === key;
                  return (
                    <button key={key} onClick={() => set("perspective", key)}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium ${on ? `${cfg.bg} ${cfg.text} border-current` : "border-gray-200 bg-white text-gray-700"}`}>
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Domain</label>
                <select value={form.domain} onChange={(e) => set("domain", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                  {DOMAIN_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
                <input value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Customer Success"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description (English)</label>
              <textarea value={form.descriptionEn} onChange={(e) => set("descriptionEn", e.target.value)} rows={2}
                placeholder="What does this KPI measure, and why does it matter?"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description (Arabic)</label>
              <textarea value={form.descriptionAr} onChange={(e) => set("descriptionAr", e.target.value)} dir="rtl" rows={2}
                placeholder="ما الذي يقيسه هذا المؤشر ولماذا هو مهم؟"
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Unit</label>
                <select value={form.unit} onChange={(e) => set("unit", e.target.value as Unit)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Direction</label>
                <select value={form.direction} onChange={(e) => set("direction", e.target.value as Direction)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                  <option value="higher-better">Higher is better</option>
                  <option value="lower-better">Lower is better</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Frequency</label>
                <select value={form.frequency} onChange={(e) => set("frequency", e.target.value as Frequency)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                  {FREQS.map((f) => <option key={f} value={f} className="capitalize">{f}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Baseline</label>
                <input type="number" value={form.baseline} onChange={(e) => set("baseline", Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Target</label>
                <input type="number" value={form.target} onChange={(e) => set("target", Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Source</label>
                <select value={form.source} onChange={(e) => set("source", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500">
                  {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Owner</label>
                <input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} placeholder="e.g. Jamie Park"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <ReviewRow label="Name" value={`${form.nameEn}${form.nameAr ? ` / ${form.nameAr}` : ""}`} />
            <ReviewRow label="Perspective / Domain" value={`${PERSPECTIVE_CONFIG[form.perspective].label} · ${form.domain}`} />
            <ReviewRow label="Department" value={form.department} />
            <ReviewRow label="Description" value={form.descriptionEn} />
            <ReviewRow label="Unit / Direction" value={`${form.unit} · ${form.direction === "higher-better" ? "Higher is better" : "Lower is better"}`} />
            <ReviewRow label="Baseline → Target" value={`${form.baseline} → ${form.target}`} />
            <ReviewRow label="Frequency / Source" value={`${form.frequency} · ${form.source}`} />
            <ReviewRow label="Owner" value={form.ownerName} />
            <p className="pt-2 text-xs text-gray-400">
              This creates a draft KPI with default threshold bands. Alignment, real thresholds, and targets can be refined from the Definition page.
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
          <button onClick={step === 0 ? onClose : back} className="flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <ChevronLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              disabled={(step === 0 && !step0Valid) || (step === 1 && !step1Valid)}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={create} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Create Draft KPI
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-50 pb-2 text-sm">
      <span className="shrink-0 text-gray-400">{label}</span>
      <span className="text-right font-medium text-gray-900">{value || "—"}</span>
    </div>
  );
}

"use client";

import { useState } from "react";
import { BookOpen, Tag, X } from "lucide-react";
import { Scorecard, ScorecardStatus, PerspectiveKey } from "@/types/scorecard";
import { SCORECARD_STATUS_CONFIG, PERSPECTIVE_CONFIG, colorForInitials, DEFAULT_PERSPECTIVE_WEIGHTS } from "@/lib/scorecardConfig";

interface Props {
  onClose: () => void;
  onAdd: (scorecard: Scorecard) => void;
}

const PERSPECTIVE_KEYS: PerspectiveKey[] = ["financial", "customer", "internal-process", "learning-growth"];
const REVIEW_FREQUENCIES = ["Weekly", "Monthly", "Quarterly", "Annually"];

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
const labelClass = "mb-1 block text-sm font-medium text-gray-700";
const sectionLabelClass = "mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400";

const initialFormState = {
  name: "",
  description: "",
  department: "",
  status: "draft" as ScorecardStatus,
  ownerName: "",
  ownerInitials: "",
  period: "Q3 2025",
  reviewFrequency: "Monthly",
  startDate: "Jan 2025",
  endDate: "Dec 2025",
  strategyName: "Enterprise Digital Transformation 2025–2027",
  strategicTheme: "",
  strategicObjective: "",
  primaryPerspective: "all" as PerspectiveKey | "all",
  strategicWeight: 25,
  tags: "",
  notes: "",
};

export default function NewScorecardModal({ onClose, onAdd }: Props) {
  const [form, setForm] = useState(initialFormState);
  const set = <K extends keyof typeof initialFormState>(key: K, value: (typeof initialFormState)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isValid = form.name.trim() && form.department.trim() && form.ownerName.trim();

  const buildScorecard = (): Scorecard | null => {
    if (!isValid) return null;
    const initials = form.ownerInitials.trim().toUpperCase() || form.ownerName.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const owner = { initials, color: colorForInitials(initials) };
    const id = `sc-${Date.now()}`;

    return {
      id,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      department: form.department.trim(),
      period: form.period,
      ownerName: form.ownerName.trim(),
      status: form.status,
      score: 0,
      reviewFrequency: form.reviewFrequency,
      startDate: form.startDate.trim() || undefined,
      endDate: form.endDate.trim() || undefined,
      strategyName: form.strategyName.trim() || undefined,
      strategicTheme: form.strategicTheme.trim() || undefined,
      strategicObjective: form.strategicObjective.trim() || undefined,
      primaryPerspective: form.primaryPerspective,
      strategicWeight: form.strategicWeight,
      tags: form.tags.trim() ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      notes: form.notes.trim() || undefined,
      perspectives: PERSPECTIVE_KEYS.map((key) => ({
        id: `${id}-${key}`,
        key,
        owner,
        score: 0,
        weight: DEFAULT_PERSPECTIVE_WEIGHTS[key],
        kpis: [],
      })),
    };
  };

  const handleCreate = () => {
    const scorecard = buildScorecard();
    if (!scorecard) return;
    onAdd(scorecard);
    onClose();
  };

  const handleSaveAndAddAnother = () => {
    const scorecard = buildScorecard();
    if (!scorecard) return;
    onAdd(scorecard);
    setForm(initialFormState);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-xl">
        {/* header */}
        <div className="flex shrink-0 items-start justify-between gap-4 bg-[#0e3a52] px-6 py-5 text-white">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <BookOpen className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">New Balanced Scorecard</h2>
              <p className="mt-0.5 text-xs text-white/70">Fill in the details to create a new scorecard</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <div>
              <p className={sectionLabelClass}>Basic Information</p>
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Scorecard Name <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Q4 Corporate Scorecard" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Brief description of this scorecard's purpose..." rows={2} className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Department <span className="text-red-500">*</span></label>
                    <input value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Engineering" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Status</label>
                    <select value={form.status} onChange={(e) => set("status", e.target.value as ScorecardStatus)} className={inputClass}>
                      {Object.entries(SCORECARD_STATUS_CONFIG).map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <p className={sectionLabelClass}>Ownership &amp; Schedule</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Owner Name <span className="text-red-500">*</span></label>
                    <input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} placeholder="e.g. Alex Morgan" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Owner Initials</label>
                    <input value={form.ownerInitials} onChange={(e) => set("ownerInitials", e.target.value)} placeholder="e.g. AM" maxLength={2} className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Period</label>
                    <input value={form.period} onChange={(e) => set("period", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Review Frequency</label>
                    <select value={form.reviewFrequency} onChange={(e) => set("reviewFrequency", e.target.value)} className={inputClass}>
                      {REVIEW_FREQUENCIES.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Start Date</label>
                    <input value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>End Date</label>
                    <input value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <p className={sectionLabelClass}>Strategic Alignment</p>
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Associated Corporate Strategy</label>
                  <input value={form.strategyName} onChange={(e) => set("strategyName", e.target.value)} className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Strategic Theme</label>
                    <input value={form.strategicTheme} onChange={(e) => set("strategicTheme", e.target.value)} placeholder="e.g. Customer Excellence" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Strategic Objective</label>
                    <input value={form.strategicObjective} onChange={(e) => set("strategicObjective", e.target.value)} placeholder="e.g. Grow Revenue 40%" className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Primary Perspective</label>
                    <select value={form.primaryPerspective} onChange={(e) => set("primaryPerspective", e.target.value as PerspectiveKey | "all")} className={inputClass}>
                      <option value="all">All Perspectives</option>
                      {PERSPECTIVE_KEYS.map((key) => (
                        <option key={key} value={key}>{PERSPECTIVE_CONFIG[key].label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Weight (%)</label>
                    <input type="number" min={0} max={100} value={form.strategicWeight} onChange={(e) => set("strategicWeight", Number(e.target.value))} className={inputClass} />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <p className={sectionLabelClass}>Tags &amp; Notes</p>
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Tags</label>
                  <div className="relative">
                    <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="strategy, finance, 2025 (comma-separated)" className={`${inputClass} pl-9`} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Notes</label>
                  <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Any additional context or notes..." rows={2} className={inputClass} />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-800">Default Perspectives</p>
              <p className="mt-0.5 text-xs text-gray-500">The scorecard will be created with these 4 standard perspectives. Add KPIs after creation.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {PERSPECTIVE_KEYS.map((key) => {
                  const cfg = PERSPECTIVE_CONFIG[key];
                  const Icon = cfg.icon;
                  return (
                    <div key={key} className={`flex items-center gap-2 rounded-lg border border-gray-200 ${cfg.bg} px-3 py-2`}>
                      <Icon className={`h-4 w-4 shrink-0 ${cfg.text}`} />
                      <span className="truncate text-sm font-medium text-gray-700">{cfg.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAndAddAnother}
              disabled={!isValid}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save &amp; Add Another
            </button>
            <button
              onClick={handleCreate}
              disabled={!isValid}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create Scorecard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

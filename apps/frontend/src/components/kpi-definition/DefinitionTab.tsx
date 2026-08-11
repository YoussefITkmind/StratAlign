"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Direction, Frequency, Kpi, Unit } from "@/types/kpi";
import { PERSPECTIVE_ORDER, PERSPECTIVE_CONFIG } from "@/lib/kpiConfig";
import { DOMAIN_OPTIONS, SOURCE_OPTIONS } from "@/lib/catalogConfig";
import { useKpiStore } from "@/components/providers/KpiStoreProvider";

const UNITS: Unit[] = ["percent", "currency", "number", "score", "days"];
const FREQS: Frequency[] = ["weekly", "monthly", "quarterly"];

export default function DefinitionTab({ kpi }: { kpi: Kpi }) {
  const { updateKpi, addVersionEntry } = useKpiStore();
  const [form, setForm] = useState({
    nameEn: kpi.title.en, nameAr: kpi.title.ar, descriptionEn: kpi.description.en, descriptionAr: kpi.description.ar,
    domain: kpi.domain, source: kpi.source, department: kpi.department, perspective: kpi.perspective,
    unit: kpi.unit, direction: kpi.direction, frequency: kpi.frequency,
  });
  const [dirty, setDirty] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const save = () => {
    updateKpi(kpi.id, {
      name: form.nameEn, title: { en: form.nameEn, ar: form.nameAr }, description: { en: form.descriptionEn, ar: form.descriptionAr },
      domain: form.domain, source: form.source, department: form.department, perspective: form.perspective,
      unit: form.unit, direction: form.direction, frequency: form.frequency,
    });
    addVersionEntry(kpi.id, { editedBy: kpi.owner.name, editedAt: new Date().toISOString(), changeType: "definition", summary: "Definition details updated." });
    setDirty(false);
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name (English)">
          <input value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </Field>
        <Field label="Name (Arabic)">
          <input value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} dir="rtl" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Description (English)">
          <textarea value={form.descriptionEn} onChange={(e) => set("descriptionEn", e.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none" />
        </Field>
        <Field label="Description (Arabic)">
          <textarea value={form.descriptionAr} onChange={(e) => set("descriptionAr", e.target.value)} dir="rtl" rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none" />
        </Field>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Perspective</p>
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
        <Field label="Domain">
          <select value={form.domain} onChange={(e) => set("domain", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
            {DOMAIN_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <input value={form.department} onChange={(e) => set("department", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </Field>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Field label="Source">
          <select value={form.source} onChange={(e) => set("source", e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
            {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Unit">
          <select value={form.unit} onChange={(e) => set("unit", e.target.value as Unit)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Direction">
          <select value={form.direction} onChange={(e) => set("direction", e.target.value as Direction)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
            <option value="higher-better">Higher is better</option>
            <option value="lower-better">Lower is better</option>
          </select>
        </Field>
        <Field label="Frequency">
          <select value={form.frequency} onChange={(e) => set("frequency", e.target.value as Frequency)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
            {FREQS.map((f) => <option key={f} value={f} className="capitalize">{f}</option>)}
          </select>
        </Field>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400">{dirty ? "Unsaved changes" : "Up to date"}</p>
        <button onClick={save} disabled={!dirty} className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
          <Save className="h-3.5 w-3.5" /> Save Definition
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

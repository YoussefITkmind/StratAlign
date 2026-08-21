"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { PERSPECTIVE_META } from "./KpiLibraryTable";
import type { KpiLibraryRow, KpiPerspective } from "@/data/mockKpiLibrary";

const PERSPECTIVES: KpiPerspective[] = ["financial", "customer", "internal", "learning"];

const OWNER_COLOR_CYCLE = ["bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-cyan-600", "bg-violet-600"];

function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function hashCode(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return hash;
}

export default function CreateKpiModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (row: KpiLibraryRow) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");
  const [perspective, setPerspective] = useState<KpiPerspective>("financial");
  const [actual, setActual] = useState("");
  const [target, setTarget] = useState("");
  const [freq, setFreq] = useState<"Weekly" | "Monthly" | "Quarterly">("Monthly");
  const [ownerName, setOwnerName] = useState("");
  const [description, setDescription] = useState("");

  const valid = name.trim().length > 0;

  const handleCreate = () => {
    if (!valid) return;
    const owner = ownerName.trim();
    onCreate({
      id: `kpi-custom-${Date.now()}`,
      name: name.trim(),
      tag: category.trim() || "General",
      perspective,
      department: department.trim() || "Unassigned",
      owner: {
        initials: initialsOf(owner || "New Owner"),
        name: owner || "Unassigned",
        color: OWNER_COLOR_CYCLE[Math.abs(hashCode(name.trim())) % OWNER_COLOR_CYCLE.length],
      },
      actual: actual.trim() || "—",
      target: target.trim() || "—",
      variance: "—",
      favorable: true,
      trend: [0, 0, 0, 0, 0, 0],
      freq,
      approval: "draft",
      status: "on-track",
      description: description.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div role="dialog" aria-modal="true" aria-labelledby="create-kpi-title" className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h2 id="create-kpi-title" className="text-lg font-semibold text-gray-900">Create KPI</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="app-scroll flex-1 space-y-4 overflow-y-auto p-5">
          <Field label="KPI Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Revenue Growth (YoY)"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Revenue" className={inputClass} />
            </Field>
            <Field label="Department">
              <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sales" className={inputClass} />
            </Field>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">
              BSC Perspective <span className="text-red-500">*</span>
            </span>
            <div role="group" aria-label="BSC Perspective" className="grid grid-cols-4 gap-2">
              {PERSPECTIVES.map((key) => {
                const meta = PERSPECTIVE_META[key];
                const Icon = meta.icon;
                const active = perspective === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPerspective(key)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs font-medium transition ${
                      active ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Actual Value">
              <input value={actual} onChange={(e) => setActual(e.target.value)} placeholder="e.g. 38%" className={inputClass} />
            </Field>
            <Field label="Target Value">
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 40%" className={inputClass} />
            </Field>
            <Field label="Frequency">
              <select value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)} className={inputClass}>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
              </select>
            </Field>
          </div>

          <Field label="Owner Name">
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Sarah Chen" className={inputClass} />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this KPI..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={!valid}
            onClick={handleCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Create KPI
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

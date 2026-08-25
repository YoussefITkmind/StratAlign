"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type EditableObjectiveStatus = "on-track" | "at-risk" | "off-track" | "not-started";

export interface EditableObjective {
  id: string;
  name: string;
  status: EditableObjectiveStatus;
  progress: number;
  ownerName: string;
  description: string | null;
}

export default function EditObjectiveModal({
  objective,
  busy,
  onClose,
  onSave,
}: {
  objective: EditableObjective;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: {
    name: string;
    status: EditableObjectiveStatus;
    progress: number;
    ownerName: string;
    description: string | null;
  }) => void;
}) {
  const [name, setName] = useState(objective.name);
  const [status, setStatus] = useState<EditableObjectiveStatus>(objective.status);
  const [ownerName, setOwnerName] = useState(objective.ownerName);
  const [progress, setProgress] = useState(objective.progress);
  const [description, setDescription] = useState(objective.description ?? "");

  useEffect(() => {
    setName(objective.name);
    setStatus(objective.status);
    setOwnerName(objective.ownerName);
    setProgress(objective.progress);
    setDescription(objective.description ?? "");
  }, [objective]);

  const canSave = name.trim().length > 0 && ownerName.trim().length > 0 && !busy;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Edit objective">
      <div className="w-full max-w-[530px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-7 py-5">
          <h2 className="text-base font-semibold text-gray-900">Edit Objective</h2>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Close edit objective">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-7 py-6">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-900">Objective Label</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-900">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as EditableObjectiveStatus)} className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500">
                <option value="on-track">On Track</option>
                <option value="at-risk">At Risk</option>
                <option value="off-track">Off Track</option>
                <option value="not-started">Not Started</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-900">Owner Name</span>
              <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} maxLength={120} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-900">Progress — {progress}%</span>
            <input type="range" min={0} max={100} value={progress} onChange={(event) => setProgress(Number(event.target.value))} className="w-full accent-sky-500" />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-900">Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm leading-6 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 px-7 py-5">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button type="button" disabled={!canSave} onClick={() => onSave({ name: name.trim(), status, progress, ownerName: ownerName.trim(), description: description.trim() || null })} className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Save Changes</button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Scorecard, ScorecardStatus, PerspectiveKey } from "@/types/scorecard";
import { SCORECARD_STATUS_CONFIG, colorForInitials, DEFAULT_PERSPECTIVE_WEIGHTS } from "@/lib/scorecardConfig";

interface Props {
  onClose: () => void;
  onAdd: (scorecard: Scorecard) => void;
}

const PERSPECTIVE_KEYS: PerspectiveKey[] = ["financial", "customer", "internal-process", "learning-growth"];

export default function NewScorecardModal({ onClose, onAdd }: Props) {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [period, setPeriod] = useState("Q3 2025");
  const [ownerName, setOwnerName] = useState("");
  const [status, setStatus] = useState<ScorecardStatus>("draft");

  const submit = () => {
    if (!name.trim() || !department.trim() || !ownerName.trim()) return;
    const initials = ownerName.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const owner = { initials, color: colorForInitials(initials) };
    const id = `sc-${Date.now()}`;

    const scorecard: Scorecard = {
      id,
      name: name.trim(),
      department: department.trim(),
      period,
      ownerName: ownerName.trim(),
      status,
      score: 0,
      perspectives: PERSPECTIVE_KEYS.map((key) => ({
        id: `${id}-${key}`,
        key,
        owner,
        score: 0,
        weight: DEFAULT_PERSPECTIVE_WEIGHTS[key],
        kpis: [],
      })),
    };
    onAdd(scorecard);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New Scorecard</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Scorecard name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing Scorecard 2025"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Marketing"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Period</label>
              <input
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Owner</label>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Jamie Park"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ScorecardStatus)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {Object.entries(SCORECARD_STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-gray-400">
            The four standard perspectives — Financial, Customer, Internal Process, and Learning &amp; Growth — are
            added automatically. Add KPIs to each from the scorecard view.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || !department.trim() || !ownerName.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create Scorecard
          </button>
        </div>
      </div>
    </div>
  );
}

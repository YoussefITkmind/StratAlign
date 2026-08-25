"use client";

import { Trash2 } from "lucide-react";

export default function DeleteObjectiveModal({
  objectiveName,
  busy,
  onCancel,
  onDelete,
}: {
  objectiveName: string;
  busy: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Delete objective">
      <div className="w-full max-w-[440px] rounded-2xl bg-white p-7 shadow-2xl">
        <div className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
            <Trash2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Delete Objective</h2>
            <p className="mt-1.5 text-sm leading-6 text-gray-500">
              This will remove <span className="font-medium text-gray-700">{objectiveName}</span> and all its strategy-map connections. This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onDelete} disabled={busy} className="rounded-full bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{busy ? "Deleting…" : "Delete"}</button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { ArrowRight, Link2Off, Trash2 } from "lucide-react";

export default function DeleteConnectionModal({
  sourceName,
  targetName,
  relationshipLabel,
  busy,
  onCancel,
  onDelete,
}: {
  sourceName: string;
  targetName: string;
  relationshipLabel: string;
  busy: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Delete strategy map connection"
    >
      <div className="w-full max-w-[460px] rounded-2xl bg-white p-7 shadow-2xl">
        <div className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
            <Link2Off className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Delete Connection</h2>
            <p className="mt-1.5 text-sm leading-6 text-gray-500">
              This will permanently remove this <span className="font-medium text-gray-700">{relationshipLabel}</span> relationship from the Strategy Map.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span className="min-w-0 flex-1 truncate font-medium">{sourceName}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 truncate text-right font-medium">{targetName}</span>
          </div>
          <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
            {relationshipLabel}
          </p>
        </div>

        <p className="mt-4 text-xs leading-5 text-gray-400">This action cannot be undone.</p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-full bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {busy ? "Deleting…" : "Delete Connection"}
          </button>
        </div>
      </div>
    </div>
  );
}

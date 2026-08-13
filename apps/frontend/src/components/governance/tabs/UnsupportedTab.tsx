"use client";

import type { ComponentType } from "react";

/**
 * Explicit not-yet-available state for governance tabs with no backing
 * persistence yet (no Committee/Risk/Compliance module exists in the
 * backend). Showing this instead of fabricated records so the production
 * /governance screen never presents made-up operational data as real.
 */
export default function UnsupportedTab({ icon: Icon, title, body }: { icon: ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div data-testid="governance-tab-unsupported" className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-16 text-center">
      <Icon className="h-6 w-6 text-gray-300" />
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="max-w-sm text-sm text-gray-400">{body}</p>
    </div>
  );
}

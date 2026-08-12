"use client";

import type { ComplianceItem } from "@/types/governance";
import { COMPLIANCE_STATUS_CONFIG, colorForInitials, formatDate } from "@/lib/governanceConfig";

export default function ComplianceTab({ items }: { items: ComplianceItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <span>Framework / Requirement</span>
        <div className="hidden items-center gap-6 md:flex">
          <span className="w-28">Owner</span>
          <span className="w-24 text-right">Next Review</span>
        </div>
      </div>

      {items.length === 0 && (
        <div className="px-4 py-16 text-center text-sm text-gray-400">No compliance requirements tracked yet.</div>
      )}

      {items.map((item) => {
        const status = COMPLIANCE_STATUS_CONFIG[item.status];
        return (
          <div
            key={item.id}
            className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50 md:h-16 md:flex-row md:items-center md:justify-between md:py-0"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{item.framework}</span>
                <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${status.bg} ${status.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>
              <p className="truncate text-[15px] font-medium text-gray-900">{item.requirement}</p>
            </div>
            <div className="flex items-center gap-6 pl-0 md:shrink-0">
              <div className="flex w-28 items-center gap-2 text-sm text-gray-600">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${colorForInitials(
                    item.owner.initials
                  )}`}
                >
                  {item.owner.initials}
                </span>
                <span className="truncate">{item.owner.name}</span>
              </div>
              <span className="w-24 shrink-0 text-right text-sm text-gray-500">{formatDate(item.nextReview)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

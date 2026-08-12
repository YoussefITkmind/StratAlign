"use client";

import type { RiskItem } from "@/types/governance";
import { RISK_SEVERITY_CONFIG, RISK_STATUS_CONFIG, colorForInitials, formatDate } from "@/lib/governanceConfig";

export default function RiskRegisterTab({ risks }: { risks: RiskItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Risk Register
      </div>

      {risks.length === 0 && (
        <div className="px-4 py-16 text-center text-sm text-gray-400">No open risks.</div>
      )}

      {risks.map((risk) => {
        const severity = RISK_SEVERITY_CONFIG[risk.severity];
        const status = RISK_STATUS_CONFIG[risk.status];
        return (
          <div key={risk.id} className="flex items-start gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0 hover:bg-gray-50">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${severity.bar}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${severity.bg} ${severity.text}`}>
                  {severity.label}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
                <span className="text-xs font-medium text-gray-500">{risk.category}</span>
              </div>
              <p className="mt-1.5 text-[15px] font-semibold text-gray-900">{risk.title}</p>
              <p className="mt-1 text-sm text-gray-500">{risk.description}</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${colorForInitials(
                    risk.owner.initials
                  )}`}
                >
                  {risk.owner.initials}
                </span>
                <span className="font-medium text-gray-700">{risk.owner.name}</span>
                <span>· Identified {formatDate(risk.identifiedDate)}</span>
                <span>· Review {formatDate(risk.reviewDate)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

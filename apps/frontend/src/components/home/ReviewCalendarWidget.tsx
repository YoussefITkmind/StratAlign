"use client";

import { ClipboardCheck } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";
import { WidgetCard } from "./WidgetCard";

interface RealApprovalCase { id: string; entityType: string; entityId: string; createdAt: string; escalated: boolean }

/**
 * Real pending governance approvals assigned to the viewer (Prompt 1.5 —
 * same governance.myPendingApprovals query the Governance page's Approvals
 * tab and the escalations widget use). The Phase 2/3 mock committee-meeting
 * and risk-review dates this widget previously synthesized have no real
 * backend source, so this only shows what's actually real: approvals
 * genuinely awaiting this user's decision.
 */
export function ReviewCalendarWidget() {
  const { t } = useI18n();
  const query = trpc.governance.myPendingApprovals.useQuery();
  const items = ((query.data as RealApprovalCase[] | undefined) ?? []).slice(0, 5);

  return (
    <WidgetCard testId="widget-review-calendar" title={t("home.reviewCalendarTitle")} href="/governance" linkLabel={t("home.viewAll")}>
      {query.error && <p role="alert" className="text-xs text-red-600">{query.error.message}</p>}
      <ul className="flex flex-col divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.id} data-testid={`calendar-item-${item.id}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <ClipboardCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-gray-800">{item.entityType}</p>
              <p className="mt-0.5 truncate text-xs text-gray-400">{item.entityId}{item.escalated ? " · Escalated" : ""}</p>
            </div>
            <span className="shrink-0 text-xs font-medium text-gray-500">{new Date(item.createdAt).toLocaleDateString()}</span>
          </li>
        ))}
        {items.length === 0 && <p className="text-xs text-gray-400">{t("home.noUpcoming")}</p>}
      </ul>
    </WidgetCard>
  );
}

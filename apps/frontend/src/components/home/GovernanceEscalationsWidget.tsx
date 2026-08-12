"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";
import { WidgetCard } from "./WidgetCard";

/**
 * The only widget on Home backed by a real backend query rather than a Phase
 * 2/3 fixture — `governance.myPendingApprovals` (see apps/frontend/src/server/routers/governance.ts).
 * That's what lets a governance decision made elsewhere in the app show up
 * here live, in the same session, without a page reload — see the extended
 * vertical-slice scenario in e2e/approvals.spec.ts.
 */
export function GovernanceEscalationsWidget() {
  const { t } = useI18n();
  const query = trpc.governance.myPendingApprovals.useQuery();
  const cases = query.data ?? [];
  const escalatedCount = cases.filter((c) => c.escalated).length;

  return (
    <WidgetCard
      testId="widget-governance-escalations"
      title={t("home.governanceEscalationsTitle")}
      subtitle={t("home.governanceEscalationsSubtitle").replace("{count}", String(cases.length)).replace("{escalated}", String(escalatedCount))}
      href="/approvals"
      linkLabel={t("home.viewAll")}
    >
      <div className="flex flex-col divide-y divide-gray-100">
        {cases.slice(0, 5).map((item) => (
          <Link
            key={item.id}
            href={`/approvals/${item.id}`}
            data-testid={`governance-escalation-${item.id}`}
            className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-gray-50"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-gray-800">{item.caseType}</p>
              <p className="mt-0.5 truncate text-xs text-gray-400">
                {t("home.submittedBy")}: {item.submittedBy}
              </p>
            </div>
            {item.escalated && (
              <span
                data-testid="widget-escalated-badge"
                className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
              >
                {t("home.escalated")}
              </span>
            )}
          </Link>
        ))}
        {cases.length === 0 && <p className="text-xs text-gray-400">{t("home.noEscalations")}</p>}
      </div>
    </WidgetCard>
  );
}

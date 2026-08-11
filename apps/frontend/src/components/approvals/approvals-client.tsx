"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";

export function ApprovalsClient() {
  const { t } = useI18n();
  const query = trpc.governance.myPendingApprovals.useQuery();

  return (
    <div>
      <h1 className="text-[1.4rem] font-bold tracking-tight text-slate-900">
        {t("approvals.title")}
      </h1>
      <p className="mt-1 text-[14px] text-slate-500">{t("approvals.subtitle")}</p>

      <div className="mt-6 flex flex-col gap-3" data-testid="approvals-list">
        {query.data?.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-words text-[14px] font-semibold text-slate-900">{item.caseType}</span>
                {item.escalated && (
                  <span
                    data-testid="escalated-badge"
                    className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                  >
                    {t("approvals.escalated")}
                  </span>
                )}
              </div>
              <p className="mt-1 break-words text-[12.5px] text-slate-500">
                {t("approvals.submittedBy")}: {item.submittedBy} ·{" "}
                {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
            <Link
              href={`/approvals/${item.id}`}
              className="shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium text-[var(--brand-accent,#2E8FA3)] hover:underline"
            >
              {t("approvals.viewCase")}
            </Link>
          </div>
        ))}
        {query.data?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-[13px] text-slate-400">
            {t("approvals.empty")}
          </div>
        )}
      </div>
    </div>
  );
}

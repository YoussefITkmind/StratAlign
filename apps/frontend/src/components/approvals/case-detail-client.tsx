"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";

function DiffTable({
  before,
  after,
  labelBefore,
  labelAfter,
}: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  labelBefore: string;
  labelAfter: string;
}) {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-start text-[13px]">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-4 py-2.5 text-start font-medium">Field</th>
            <th className="px-4 py-2.5 text-start font-medium">{labelBefore}</th>
            <th className="px-4 py-2.5 text-start font-medium">{labelAfter}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const changed = JSON.stringify(before[key]) !== JSON.stringify(after[key]);
            return (
              <tr key={key} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-medium text-slate-700">{key}</td>
                <td className="px-4 py-2.5 text-slate-500 break-words">{String(before[key] ?? "—")}</td>
                <td
                  className={
                    "px-4 py-2.5 break-words " + (changed ? "font-semibold text-emerald-700" : "text-slate-500")
                  }
                >
                  {String(after[key] ?? "—")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CaseDetailClient({ caseId }: { caseId: string }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const query = trpc.governance.getCase.useQuery({ id: caseId });

  const decide = trpc.governance.decide.useMutation({
    onSuccess: () => {
      setError(null);
      utils.governance.getCase.invalidate({ id: caseId });
      utils.governance.myPendingApprovals.invalidate();
    },
    onError: (err) => {
      const isOwnSubmission = (err.data as { ownSubmission?: boolean } | undefined)?.ownSubmission;
      setError(isOwnSubmission ? t("approvals.ownCaseBlocked") : err.message);
    },
  });

  if (query.isLoading) return <p className="text-[13px] text-slate-500">{t("common.loading")}</p>;
  if (!query.data) return <p className="text-[13px] text-slate-500">Not found.</p>;

  const item = query.data;
  const decided = item.status !== "pending";

  return (
    <div>
      <Link href="/approvals" className="text-[13px] font-medium text-slate-500 hover:text-slate-700">
        ← {t("common.back")}
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-[1.3rem] font-bold tracking-tight text-slate-900">{item.caseType}</h1>
        {item.escalated && (
          <span
            data-testid="escalated-badge"
            className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
          >
            {t("approvals.escalated")}
          </span>
        )}
        {decided && (
          <span
            data-testid="decision-badge"
            className={
              "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
              (item.status === "approved"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800")
            }
          >
            {item.status === "approved" ? t("approvals.decidedApproved") : t("approvals.decidedRejected")}
          </span>
        )}
      </div>
      <p className="mt-1 text-[13px] text-slate-500">
        {t("approvals.submittedBy")}: {item.submittedBy} · {t("approvals.submittedAt")}:{" "}
        {new Date(item.createdAt).toLocaleString()}
      </p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <DiffTable
          before={item.proposedChange.before}
          after={item.proposedChange.after}
          labelBefore={t("approvals.before")}
          labelAfter={t("approvals.after")}
        />
      </div>

      {error && (
        <div
          role="alert"
          data-testid="decision-error"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700"
        >
          {error}
        </div>
      )}

      {!decided && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
          <label htmlFor="decision-reason" className="mb-1.5 block text-[13px] font-medium text-slate-700">
            {t("approvals.decisionReasonLabel")}
          </label>
          <textarea
            id="decision-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
          />
          <div className="mt-3 flex gap-2">
            <button
              data-testid="approve-case"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: caseId, decision: "approved", reason })}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {t("approvals.approveButton")}
            </button>
            <button
              data-testid="reject-case"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: caseId, decision: "rejected", reason })}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {t("approvals.rejectButton")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

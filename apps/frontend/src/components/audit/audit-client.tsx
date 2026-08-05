"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";

export function AuditClient() {
  const { t } = useI18n();
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedFilter, setAppliedFilter] = useState<{
    actor?: string;
    from?: string;
    to?: string;
  }>({});

  const query = trpc.audit.list.useQuery(appliedFilter);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setAppliedFilter({
      actor: actor.trim() || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    });
  }

  function clearFilters() {
    setActor("");
    setFrom("");
    setTo("");
    setAppliedFilter({});
  }

  return (
    <div>
      <h1 className="text-[1.4rem] font-bold tracking-tight text-slate-900">{t("audit.title")}</h1>
      <p className="mt-1 text-[14px] text-slate-500">{t("audit.subtitle")}</p>

      <form onSubmit={applyFilters} className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="audit-filter-actor" className="mb-1.5 block text-[13px] font-medium text-slate-700">
            {t("audit.filterActorLabel")}
          </label>
          <input
            id="audit-filter-actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="admin@stratalign.dev"
            className="w-56 rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
          />
        </div>
        <div>
          <label htmlFor="audit-filter-from" className="mb-1.5 block text-[13px] font-medium text-slate-700">
            {t("audit.filterFromLabel")}
          </label>
          <input
            id="audit-filter-from"
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
          />
        </div>
        <div>
          <label htmlFor="audit-filter-to" className="mb-1.5 block text-[13px] font-medium text-slate-700">
            {t("audit.filterToLabel")}
          </label>
          <input
            id="audit-filter-to"
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
          />
        </div>
        <button
          type="submit"
          data-testid="apply-audit-filter"
          className="rounded-xl bg-gradient-to-r from-[#0E2338] to-[#2E8FA3] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-95"
        >
          {t("audit.apply")}
        </button>
        <button
          type="button"
          onClick={clearFilters}
          className="rounded-xl px-4 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {t("audit.clear")}
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-start text-[13px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-start font-medium">{t("common.eventType")}</th>
              <th className="px-4 py-2.5 text-start font-medium">{t("common.actor")}</th>
              <th className="px-4 py-2.5 text-start font-medium">{t("common.timestamp")}</th>
              <th className="px-4 py-2.5 text-start font-medium">{t("audit.details")}</th>
            </tr>
          </thead>
          <tbody data-testid="audit-rows">
            {query.data?.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-medium text-slate-900">{entry.eventType}</td>
                <td className="px-4 py-2.5 text-slate-600">{entry.actor}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {new Date(entry.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-slate-500">{entry.details ?? "—"}</td>
              </tr>
            ))}
            {query.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  {t("audit.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

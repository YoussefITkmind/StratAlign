"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";

type FilterKey = "all" | "on_track" | "at_risk" | "off_track" | "mine";

const FILTERS: { key: FilterKey; labelKey: string }[] = [
  { key: "all", labelKey: "initiatives.filterAll" },
  { key: "on_track", labelKey: "initiatives.filterOnTrack" },
  { key: "at_risk", labelKey: "initiatives.filterAtRisk" },
  { key: "off_track", labelKey: "initiatives.filterOffTrack" },
  { key: "mine", labelKey: "initiatives.filterMine" },
];

const STAGES = ["design", "pilot", "execute", "scale", "done"] as const;

function badgeClass(tone: "neutral" | "emerald" | "amber" | "red") {
  switch (tone) {
    case "emerald":
      return "bg-emerald-50 text-emerald-700";
    case "amber":
      return "bg-amber-50 text-amber-700";
    case "red":
      return "bg-red-50 text-red-700";
    default:
      return "bg-gray-50 text-gray-500";
  }
}

function statusTone(status: string | null): "neutral" | "emerald" | "amber" | "red" {
  if (status === "on_track") return "emerald";
  if (status === "at_risk") return "amber";
  if (status === "off_track") return "red";
  return "neutral";
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

export function InitiativesRegisterClient() {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [creating, setCreating] = useState(false);

  const list = trpc.execution.initiative.list.useQuery({
    status: filter === "on_track" || filter === "at_risk" || filter === "off_track" ? filter : undefined,
    scope: filter === "mine" ? "mine" : "all",
  });
  const nodes = trpc.strategy.nodes.useQuery();
  const plays = nodes.data?.filter((node) => node.type === "strategic_play" && node.state === "active") ?? [];
  const playNameById = new Map((nodes.data ?? []).map((node) => [node.id, node.nameEn]));

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.4rem] font-bold tracking-tight text-slate-900">{t("initiatives.registerTitle")}</h1>
          <p className="mt-1 text-[14px] text-slate-500">{t("initiatives.registerSubtitle")}</p>
        </div>
        <button
          data-testid="new-initiative-button"
          onClick={() => setCreating(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {t("initiatives.newInitiative")}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" data-testid="initiative-filter-chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            data-testid={`filter-chip-${f.key}`}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              filter === f.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {creating && (
        <NewInitiativeForm
          plays={plays}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await utils.execution.initiative.list.invalidate();
          }}
        />
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-start text-[13px]" data-testid="initiative-register-grid">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">{t("initiatives.columnInitiative")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("initiatives.columnPlay")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("initiatives.columnOwner")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("initiatives.columnStage")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("initiatives.columnStatus")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("initiatives.columnConfidence")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("initiatives.columnLinkedProjects")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{t("initiatives.columnUpdated")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((item) => (
                <tr key={item.id} data-testid="initiative-row" className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/initiatives-projects/${item.id}`} className="font-semibold text-slate-900 hover:underline">
                      {item.nameEn}
                    </Link>
                    <p dir="rtl" className="mt-0.5 text-[12px] text-slate-400">{item.nameAr}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{playNameById.get(item.strategicPlayNodeId) ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400"><span className="break-all">{item.ownerUserId}</span></td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass("neutral")}`}>
                      {t(`initiatives.stage_${item.stage}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass(statusTone(item.latestStatus))}`}>
                      {item.latestStatus ? t(`initiatives.status_${item.latestStatus}`) : t("initiatives.noStatusYet")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.latestConfidence ? t(`initiatives.confidence_${item.latestConfidence}`) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.hasJiraLink ? 1 : 0}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(item.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.isLoading && <p className="p-6 text-center text-[13px] text-slate-400">{t("common.loading")}</p>}
        {list.data?.length === 0 && (
          <p className="p-8 text-center text-[13px] text-slate-400">{t("initiatives.empty")}</p>
        )}
      </div>
    </div>
  );
}

function NewInitiativeForm({
  plays,
  onClose,
  onCreated,
}: {
  plays: { id: string; nameEn: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [strategicPlayNodeId, setStrategicPlayNodeId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [stage, setStage] = useState<(typeof STAGES)[number]>("design");
  const [playError, setPlayError] = useState(false);

  const register = trpc.execution.initiative.register.useMutation({
    onSuccess: onCreated,
  });

  const submit = () => {
    if (!strategicPlayNodeId) {
      setPlayError(true);
      return;
    }
    setPlayError(false);
    register.mutate({ nameEn, nameAr, strategicPlayNodeId, ownerUserId, stage });
  };

  return (
    <div data-testid="new-initiative-form" className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[1.05rem] font-bold text-slate-900">{t("initiatives.formTitle")}</h2>
        <button onClick={onClose} aria-label={t("initiatives.formCancel")}>
          <X className="h-4.5 w-4.5 text-slate-400" />
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-[13px] text-slate-600">
          {t("initiatives.formNameEn")}
          <input
            data-testid="initiative-name-en"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none focus:border-[var(--brand-accent,#4FB6C9)]"
          />
        </label>
        <label className="text-[13px] text-slate-600">
          {t("initiatives.formNameAr")}
          <input
            dir="rtl"
            data-testid="initiative-name-ar"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none focus:border-[var(--brand-accent,#4FB6C9)]"
          />
        </label>
        <label className="text-[13px] text-slate-600 md:col-span-2">
          {t("initiatives.formPlay")}
          <select
            data-testid="initiative-play-select"
            value={strategicPlayNodeId}
            onChange={(e) => {
              setStrategicPlayNodeId(e.target.value);
              if (e.target.value) setPlayError(false);
            }}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none focus:border-[var(--brand-accent,#4FB6C9)]"
          >
            <option value="">{t("initiatives.formPlaySelect")}</option>
            {plays.map((play) => (
              <option key={play.id} value={play.id}>{play.nameEn}</option>
            ))}
          </select>
          {playError && (
            <p role="alert" data-testid="initiative-play-required-error" className="mt-1 text-[12.5px] text-red-600">
              {t("initiatives.formPlayRequired")}
            </p>
          )}
        </label>
        <label className="text-[13px] text-slate-600">
          {t("initiatives.formOwner")}
          <input
            data-testid="initiative-owner-id"
            value={ownerUserId}
            onChange={(e) => setOwnerUserId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none focus:border-[var(--brand-accent,#4FB6C9)]"
          />
        </label>
        <label className="text-[13px] text-slate-600">
          {t("initiatives.formStage")}
          <select
            data-testid="initiative-stage-select"
            value={stage}
            onChange={(e) => setStage(e.target.value as (typeof STAGES)[number])}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none focus:border-[var(--brand-accent,#4FB6C9)]"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{t(`initiatives.stage_${s}`)}</option>
            ))}
          </select>
        </label>
      </div>

      {register.error && (
        <p role="alert" data-testid="initiative-register-error" className="mt-3 text-[13px] text-red-600">
          {message(register.error)}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[13px] font-medium text-slate-600">
          {t("initiatives.formCancel")}
        </button>
        <button
          data-testid="submit-new-initiative"
          disabled={register.isPending || !nameEn.trim() || !nameAr.trim() || !ownerUserId.trim()}
          onClick={submit}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {register.isPending ? t("initiatives.formSaving") : t("initiatives.formSave")}
        </button>
      </div>
    </div>
  );
}

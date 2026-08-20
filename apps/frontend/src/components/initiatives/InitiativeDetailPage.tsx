"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Flag, Link2, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import {
  COLOR_TOKENS,
  MOCK_INITIATIVES,
  type InitiativeColor,
} from "@/data/mockInitiativesBoard";

const STAGES = ["design", "pilot", "execute", "scale", "done"] as const;
const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  design: "Design",
  pilot: "Pilot",
  execute: "Execute",
  scale: "Scale",
  done: "Done",
};
const STATUSES = ["on_track", "at_risk", "off_track"] as const;
const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
};
const CONFIDENCES = ["high", "medium", "low"] as const;
const CONFIDENCE_LABEL: Record<(typeof CONFIDENCES)[number], string> = { high: "High", medium: "Medium", low: "Low" };

const PALETTE: InitiativeColor[] = ["sky", "violet", "emerald", "purple", "red", "orange", "pink", "amber"];
function colorForId(id: string): InitiativeColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

interface StatusHistoryEntry {
  id: string;
  period: string;
  stage: (typeof STAGES)[number];
  status: (typeof STATUSES)[number];
  confidence: (typeof CONFIDENCES)[number];
  narrativeEn: string | null;
  narrativeAr: string | null;
  submittedBy: string;
  createdAt: string | Date;
}

export function InitiativeDetailPage({ id }: { id: string }) {
  const list = trpc.execution.initiative.list.useQuery({ scope: "all" });
  const nodes = trpc.strategy.nodes.useQuery();

  const real = list.data?.find((item) => item.id === id);
  const mock = MOCK_INITIATIVES.find((item) => item.id === id);

  if (list.isLoading) {
    return <p className="p-8 text-center text-[13px] text-slate-400">Loading initiative…</p>;
  }

  if (!real && !mock) {
    return (
      <div className="mx-auto max-w-[720px] rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-[14px] font-medium text-slate-700">This initiative could not be found.</p>
        <Link href="/initiatives-projects" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-sky-700 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Initiatives &amp; Projects
        </Link>
      </div>
    );
  }

  const nameEn = real?.nameEn ?? mock?.name ?? "Untitled initiative";
  const stage = real?.stage ?? "design";
  const play = nodes.data?.find((n) => n.id === real?.strategicPlayNodeId);
  const playName = play?.nameEn ?? mock?.play ?? "—";
  const owner = real?.ownerUserId ?? mock?.owner ?? "—";
  const color = COLOR_TOKENS[colorForId(id)];
  const hasJiraLink = real?.hasJiraLink ?? false;

  return (
    <div className="mx-auto max-w-[960px]">
      <Link href="/initiatives-projects" className="flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Initiatives &amp; Projects
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
            <h1 className="text-[1.4rem] font-bold tracking-tight text-slate-900">{nameEn}</h1>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            {real ? `Stage: ${STAGE_LABEL[stage]}` : "Preview only · demo data, not backed by a registered record"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StrategicAlignmentCard playName={playName} owner={owner} sponsor={mock?.sponsor} objective={mock?.description} />
        <LinkedDeliveryCard hasJiraLink={hasJiraLink} isReal={!!real} />
      </div>

      <div className="mt-4">
        <KeyMilestonesCard mock={mock} />
      </div>

      {real ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StatusUpdateForm initiativeId={real.id} defaultStage={real.stage} />
          <UpdateHistoryTimeline initiativeId={real.id} />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-[13px] text-slate-400">
          Monthly status updates are only available for initiatives registered through the Register tab. This card is
          part of the demo dashboard dataset.
        </div>
      )}

      <VisibleInStrip />
    </div>
  );
}

function StrategicAlignmentCard({
  playName,
  owner,
  sponsor,
  objective,
}: {
  playName: string;
  owner: string;
  sponsor?: string;
  objective?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-[14px] font-bold text-slate-900">Strategic Alignment</h2>
      <dl className="mt-3 space-y-2.5 text-[13px]">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-400">Objective</dt>
          <dd className="max-w-[65%] text-end font-medium text-slate-700">{objective ? objective.split(".")[0] + "." : "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-400">Strategic Play</dt>
          <dd className="font-medium text-slate-700">{playName}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-400">Owner</dt>
          <dd className="max-w-[65%] truncate text-end font-medium text-slate-700" title={owner}>{owner}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-400">Sponsor</dt>
          <dd className="font-medium text-slate-700">{sponsor ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

function LinkedDeliveryCard({ hasJiraLink, isReal }: { hasJiraLink: boolean; isReal: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-slate-900">Linked Delivery</h2>
        <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-500">
          <Link2 className="h-3 w-3" />
          from Jira
        </span>
      </div>
      {isReal && hasJiraLink ? (
        <p className="mt-3 text-[13px] text-slate-600">
          A Jira project is linked to this initiative. Live sync of Jira issues and milestones will populate here once
          Phase 6 ships.
        </p>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[12.5px] text-slate-400">
          No Jira project linked yet. This panel stays empty and unsynced until Phase 6 — nothing shown here is
          simulated.
        </div>
      )}
    </div>
  );
}

function KeyMilestonesCard({ mock }: { mock: (typeof MOCK_INITIATIVES)[number] | undefined }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-slate-900">Key Milestones</h2>
        {mock && (
          <span className="text-[12px] text-slate-400">
            {mock.milestonesDone}/{mock.milestonesTotal} complete
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-[12.5px] text-slate-400">
        <Flag className="h-4 w-4 shrink-0" />
        No milestones have been flagged for this initiative yet. Milestones appear here once flagged manually or
        synced from a linked Jira project.
      </div>
    </div>
  );
}

function StatusUpdateForm({ initiativeId, defaultStage }: { initiativeId: string; defaultStage: (typeof STAGES)[number] }) {
  const utils = trpc.useUtils();
  const [stage, setStage] = useState<(typeof STAGES)[number]>(defaultStage);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("on_track");
  const [confidence, setConfidence] = useState<(typeof CONFIDENCES)[number]>("medium");
  const [narrativeEn, setNarrativeEn] = useState("");
  const [narrativeAr, setNarrativeAr] = useState("");
  const period = useMemo(() => currentPeriod(), []);

  const update = trpc.execution.status.update.useMutation({
    onSuccess: async () => {
      setNarrativeEn("");
      setNarrativeAr("");
      await utils.execution.status.history.invalidate({ initiativeId });
    },
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-[14px] font-bold text-slate-900">Monthly Status Update</h2>
      <p className="mt-0.5 text-[12px] text-slate-400">Period: {period}</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-[12.5px] text-slate-600">
          Stage
          <select
            data-testid="status-stage-select"
            value={stage}
            onChange={(e) => setStage(e.target.value as (typeof STAGES)[number])}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] text-slate-600">
          Status
          <select
            data-testid="status-status-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] text-slate-600">
          Confidence
          <select
            data-testid="status-confidence-select"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value as (typeof CONFIDENCES)[number])}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          >
            {CONFIDENCES.map((c) => (
              <option key={c} value={c}>{CONFIDENCE_LABEL[c]}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block text-[12.5px] text-slate-600">
        Narrative (English)
        <textarea
          data-testid="status-narrative-en"
          value={narrativeEn}
          onChange={(e) => setNarrativeEn(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
      </label>
      <label className="mt-2 block text-[12.5px] text-slate-600">
        Narrative (Arabic)
        <textarea
          dir="rtl"
          data-testid="status-narrative-ar"
          value={narrativeAr}
          onChange={(e) => setNarrativeAr(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
      </label>

      {update.error && (
        <p role="alert" data-testid="status-update-error" className="mt-2 text-[12.5px] text-red-600">
          {message(update.error)}
        </p>
      )}
      {update.isSuccess && !update.error && (
        <p className="mt-2 text-[12.5px] text-emerald-600">Status update posted.</p>
      )}

      <button
        data-testid="submit-status-update"
        disabled={update.isPending}
        onClick={() =>
          update.mutate({
            initiativeId,
            period,
            stage,
            status,
            confidence,
            narrativeEn: narrativeEn.trim() || null,
            narrativeAr: narrativeAr.trim() || null,
          })
        }
        className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {update.isPending ? "Posting…" : "Post Update"}
      </button>
    </div>
  );
}

function UpdateHistoryTimeline({ initiativeId }: { initiativeId: string }) {
  const history = trpc.execution.status.history.useQuery({ initiativeId });
  const entries = (history.data ?? []) as unknown as StatusHistoryEntry[];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-[14px] font-bold text-slate-900">Update History</h2>
      {history.isLoading && <p className="mt-3 text-[12.5px] text-slate-400">Loading…</p>}
      {!history.isLoading && entries.length === 0 && (
        <p className="mt-3 text-[12.5px] text-slate-400">No status updates have been posted yet.</p>
      )}
      <ol data-testid="status-history-list" className="mt-3 space-y-3">
        {entries
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map((entry) => (
            <li key={entry.id} data-testid="status-history-entry" className="flex gap-2.5 border-l-2 border-slate-100 pl-3">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-slate-700">
                  <span>{entry.period}</span>
                  <span className="text-slate-300">·</span>
                  <span>{STAGE_LABEL[entry.stage]}</span>
                  <span className="text-slate-300">·</span>
                  <span>{STATUS_LABEL[entry.status]}</span>
                  <span className="text-slate-300">·</span>
                  <span>{CONFIDENCE_LABEL[entry.confidence]} confidence</span>
                </div>
                {entry.narrativeEn && <p className="mt-0.5 text-[12.5px] text-slate-500">{entry.narrativeEn}</p>}
                <p className="mt-0.5 text-[11px] text-slate-400">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>
            </li>
          ))}
      </ol>
    </div>
  );
}

function VisibleInStrip() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-[12.5px] text-slate-500">
      <span className="font-semibold text-slate-600">Visible in:</span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">Home</span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">Traceability</span>
      <span className="ml-1 text-slate-400">— other surfaces will appear here once they genuinely consume initiative data.</span>
    </div>
  );
}

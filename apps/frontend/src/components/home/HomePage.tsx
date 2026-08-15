"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { PlatformRole } from "@spm/domain-iam";
import { trpc } from "@/lib/trpc/client";
import { resolveHomeRole, widgetsForRole, type WidgetKey } from "@/lib/roleWidgetConfig";

interface HomeKpi {
  id: string;
  versionId: string;
  name: string;
  unit: string;
  ownerName: string;
  ownerUserId: string;
  actual: number;
  target: number | null;
  delta: number | null;
  history: number[];
  status: "on_track" | "watch" | "off_track" | "unknown";
  period: string;
  ownedByViewer: boolean;
}

interface UpcomingReview {
  id: string;
  cadenceDefinitionId: string;
  name: string;
  subjectType: string;
  subjectId: string;
  periodKey: string | null;
  status: string;
  reviewDueAt: string | Date;
}

interface HomeSnapshot {
  kpis: HomeKpi[];
  upcomingReviews: UpcomingReview[];
}

const STATUS = {
  on_track: { label: "On track", badge: "bg-emerald-50 text-emerald-700" },
  watch: { label: "Watch", badge: "bg-amber-50 text-amber-700" },
  off_track: { label: "Off track", badge: "bg-red-50 text-red-700" },
  unknown: { label: "Unknown", badge: "bg-gray-100 text-gray-600" },
} as const;

function WidgetCard({ testId, title, href, children }: {
  testId: string;
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className="h-full rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {href && <Link href={href} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">View all</Link>}
      </div>
      {children}
    </section>
  );
}

function formatNumber(value: number, unit: string) {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit === "%" ? `${rounded}%` : `${rounded} ${unit}`;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs text-gray-400">No trend yet</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * 72;
    const y = 28 - ((value - min) / spread) * 24;
    return `${x},${y}`;
  }).join(" ");
  return <svg aria-label="KPI trend" viewBox="0 0 72 32" className="h-8 w-20"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
}

function KpiTiles({ snapshot }: { snapshot: HomeSnapshot }) {
  const kpis = [...snapshot.kpis]
    .sort((a, b) => {
      const order = { off_track: 0, watch: 1, on_track: 2, unknown: 3 } as const;
      return order[a.status] - order[b.status];
    })
    .slice(0, 4);
  return (
    <WidgetCard testId="widget-kpi-tiles" title="Top KPIs" href="/kpis-okrs">
      <div className="grid gap-3 sm:grid-cols-2">
        {kpis.map((kpi) => (
          <div key={kpi.id} data-testid={`kpi-tile-${kpi.id}`} className="rounded-xl border border-gray-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-[13px] font-medium text-gray-800">{kpi.name}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS[kpi.status].badge}`}>{STATUS[kpi.status].label}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div>
                <p className="text-lg font-semibold text-gray-900">{formatNumber(kpi.actual, kpi.unit)}</p>
                <p className="text-xs text-gray-500">{kpi.delta == null ? "—" : `${kpi.delta >= 0 ? "+" : ""}${formatNumber(kpi.delta, kpi.unit)}`}</p>
              </div>
              <Sparkline values={kpi.history} />
            </div>
          </div>
        ))}
        {kpis.length === 0 && <p className="text-xs text-gray-400">No KPI measurements yet.</p>}
      </div>
    </WidgetCard>
  );
}

function Exceptions({ snapshot }: { snapshot: HomeSnapshot }) {
  const kpis = snapshot.kpis.filter((kpi) => kpi.status === "off_track" || kpi.status === "watch").slice(0, 6);
  return (
    <WidgetCard testId="widget-exceptions" title="Exceptions" href="/kpis-okrs">
      <div className="divide-y divide-gray-100">
        {kpis.map((kpi) => (
          <div key={kpi.id} data-testid={`exception-item-${kpi.id}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-gray-800">{kpi.name}</p>
              <p className="truncate text-xs text-gray-400">{kpi.ownerName} · {formatNumber(kpi.actual, kpi.unit)}{kpi.target == null ? "" : ` vs ${formatNumber(kpi.target, kpi.unit)}`}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS[kpi.status].badge}`}>{STATUS[kpi.status].label}</span>
          </div>
        ))}
        {kpis.length === 0 && <p className="text-xs text-gray-400">No off-track or watch KPIs.</p>}
      </div>
    </WidgetCard>
  );
}

function OwnedKpis({ snapshot }: { snapshot: HomeSnapshot }) {
  const kpis = snapshot.kpis.filter((kpi) => kpi.ownedByViewer);
  return (
    <WidgetCard testId="widget-owned-kpis" title="My KPIs" href="/kpis-okrs">
      <div className="divide-y divide-gray-100">
        {kpis.map((kpi) => (
          <div key={kpi.id} data-testid={`owned-kpi-${kpi.id}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
            <div><p className="text-[13px] font-medium text-gray-800">{kpi.name}</p><p className="text-xs text-gray-400">{formatNumber(kpi.actual, kpi.unit)} · {kpi.period}</p></div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS[kpi.status].badge}`}>{STATUS[kpi.status].label}</span>
          </div>
        ))}
        {kpis.length === 0 && <p className="text-xs text-gray-400">No owned KPI measurements yet.</p>}
      </div>
    </WidgetCard>
  );
}

function DueSubmissions() {
  // This owner-only endpoint is deliberately queried only when this widget is
  // rendered. The backend still enforces kpi_owner/data_steward; executive
  // Home views never invoke an endpoint they are not authorized to call.
  const query = trpc.capture.tasks.useQuery();
  const tasks = query.data ?? [];
  return (
    <WidgetCard testId="widget-due-submissions" title="Due submissions" href="/kpis-okrs">
      {query.error && <p role="alert" className="mb-2 text-xs text-red-600">{query.error.message}</p>}
      <div className="divide-y divide-gray-100">
        {tasks.slice(0, 6).map((task) => (
          <div key={task.id} data-testid={`due-submission-${task.id}`} className="py-2.5 first:pt-0">
            <p className="text-[13px] font-medium text-gray-800">{task.kpiName}</p>
            <p className="text-xs text-gray-400">{task.period} · due {new Date(task.dueAt).toLocaleDateString()} · {task.session?.state ?? task.cadenceState}</p>
          </div>
        ))}
        {tasks.length === 0 && !query.isLoading && <p className="text-xs text-gray-400">No due submissions.</p>}
      </div>
    </WidgetCard>
  );
}

interface ScorecardRow { id: string; nameEn: string; nameAr: string }
interface ScorecardDetail { planVersionId: string; weighting: { perspectiveWeights: Record<string, number> } | null; publishedMap: { links: Array<{ fromObjectiveId: string; toObjectiveId: string }> } | null }
interface Preview { currentScore: number | null }

function ScorecardItem({ scorecard }: { scorecard: ScorecardRow }) {
  const detailQuery = trpc.scorecard.get.useQuery({ scorecardId: scorecard.id });
  const detail = detailQuery.data as ScorecardDetail | undefined;
  const weights = detail?.weighting?.perspectiveWeights;
  const previewQuery = trpc.scorecard.weighting.preview.useQuery({ scorecardId: scorecard.id, draftWeights: weights ?? {} }, { enabled: Boolean(weights) });
  const score = (previewQuery.data as Preview | undefined)?.currentScore;
  return (
    <Link href={`/balanced-scorecards/${scorecard.id}`} data-testid={`scorecard-strip-item-${scorecard.id}`} className="min-w-44 rounded-xl border border-gray-100 p-3 hover:bg-gray-50">
      <p className="truncate text-[13px] font-medium text-gray-800">{scorecard.nameEn}</p>
      <p data-testid={`scorecard-strip-score-${scorecard.id}`} className="mt-1 text-xl font-bold text-gray-900">{score == null ? "—" : `${Math.round(score)}%`}</p>
    </Link>
  );
}

function ScorecardStrip() {
  const query = trpc.scorecard.list.useQuery();
  const scorecards = ((query.data as ScorecardRow[] | undefined) ?? []).slice(0, 4);
  return <WidgetCard testId="widget-scorecard-strip" title="Master scorecard" href="/balanced-scorecards"><div className="flex gap-3 overflow-x-auto">{scorecards.map((scorecard) => <ScorecardItem key={scorecard.id} scorecard={scorecard} />)}{scorecards.length === 0 && <p className="text-xs text-gray-400">No scorecards yet.</p>}</div></WidgetCard>;
}

function ReviewCalendar({ snapshot }: { snapshot: HomeSnapshot }) {
  const items = snapshot.upcomingReviews.slice(0, 5);
  return (
    <WidgetCard testId="widget-review-calendar" title="Review calendar">
      <div className="divide-y divide-gray-100">
        {items.map((item) => (
          <div key={item.id} data-testid={`calendar-item-${item.id}`} className="py-2.5 first:pt-0">
            <p className="text-[13px] font-medium text-gray-800">{item.name}</p>
            <p className="text-xs text-gray-400">{item.periodKey ?? item.subjectType} · review {new Date(item.reviewDueAt).toLocaleDateString()} · {item.status.toLowerCase()}</p>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-gray-400">No upcoming scheduled reviews.</p>}
      </div>
    </WidgetCard>
  );
}

function MapThumbnail() {
  const listQuery = trpc.scorecard.list.useQuery();
  const scorecards = (listQuery.data as ScorecardRow[] | undefined) ?? [];
  const scorecardId = scorecards[0]?.id;
  const detailQuery = trpc.scorecard.get.useQuery({ scorecardId: scorecardId ?? "00000000-0000-0000-0000-000000000000" }, { enabled: Boolean(scorecardId) });
  const detail = detailQuery.data as ScorecardDetail | undefined;
  const nodesQuery = trpc.strategy.nodes.useQuery();
  const names = useMemo(() => new Map((nodesQuery.data ?? []).map((node) => [node.id, node.nameEn])), [nodesQuery.data]);
  const links = detail?.publishedMap?.links ?? [];
  return (
    <WidgetCard testId="widget-map-thumbnail" title="Strategy map" href={scorecardId ? `/strategy-maps/${scorecardId}` : undefined}>
      <div data-testid="map-thumbnail-list" className="space-y-2">
        {links.slice(0, 4).map((link) => <p key={`${link.fromObjectiveId}-${link.toObjectiveId}`} className="truncate text-xs text-gray-600">{names.get(link.fromObjectiveId) ?? link.fromObjectiveId} → {names.get(link.toObjectiveId) ?? link.toObjectiveId}</p>)}
        {links.length === 0 && <p className="text-xs text-gray-400">No published strategy map yet.</p>}
      </div>
    </WidgetCard>
  );
}

function GovernanceEscalations() {
  const query = trpc.governance.myPendingApprovals.useQuery();
  const escalated = (query.data ?? []).filter((item) => item.escalated);
  return <WidgetCard testId="widget-governance-escalations" title="Governance escalations" href="/governance">{escalated.length ? escalated.map((item) => <p key={item.id} className="py-1 text-xs text-gray-600">{item.entityType} · {item.entityId}</p>) : <p className="text-xs text-gray-400">No escalations.</p>}</WidgetCard>;
}

function InitiativesPlaceholder() {
  return <WidgetCard testId="widget-initiatives-placeholder" title="Initiatives"><p className="text-sm text-gray-500">Initiative checkpoint widgets arrive with the Phase 4 experience.</p></WidgetCard>;
}

const WIDGET_SPAN: Record<WidgetKey, string> = {
  kpiTiles: "lg:col-span-2",
  exceptions: "lg:col-span-1",
  scorecardStrip: "lg:col-span-2",
  reviewCalendar: "lg:col-span-1",
  mapThumbnail: "lg:col-span-1",
  ownedKpis: "lg:col-span-1",
  dueSubmissions: "lg:col-span-1",
  governanceEscalations: "lg:col-span-1",
  initiativesPlaceholder: "lg:col-span-2",
};

export function HomePage({ roles }: { roles: PlatformRole[] }) {
  const role = useMemo(() => resolveHomeRole(roles), [roles]);
  const widgets = useMemo(() => widgetsForRole(role), [role]);
  const snapshotQuery = trpc.home.snapshot.useQuery();
  const snapshot = (snapshotQuery.data as HomeSnapshot | undefined) ?? { kpis: [], upcomingReviews: [] };

  const renderWidget = (key: WidgetKey) => {
    switch (key) {
      case "kpiTiles": return <KpiTiles snapshot={snapshot} />;
      case "exceptions": return <Exceptions snapshot={snapshot} />;
      case "scorecardStrip": return <ScorecardStrip />;
      case "reviewCalendar": return <ReviewCalendar snapshot={snapshot} />;
      case "mapThumbnail": return <MapThumbnail />;
      case "ownedKpis": return <OwnedKpis snapshot={snapshot} />;
      case "dueSubmissions": return <DueSubmissions />;
      case "governanceEscalations": return <GovernanceEscalations />;
      case "initiativesPlaceholder": return <InitiativesPlaceholder />;
    }
  };

  return (
    <div data-testid="home-page" className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-[22px] font-bold text-gray-900">Home</h1><p className="mt-0.5 text-sm text-gray-500">Your workspace, composed for your role.</p></div>
        {role && <span data-testid="home-role-label" className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">{role.replaceAll("_", " ")}</span>}
      </div>
      {snapshotQuery.error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{snapshotQuery.error.message}</p>}
      <div data-testid="home-widgets" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {widgets.map((key) => <div key={key} data-testid={`widget-slot-${key}`} className={WIDGET_SPAN[key]}>{renderWidget(key)}</div>)}
      </div>
    </div>
  );
}

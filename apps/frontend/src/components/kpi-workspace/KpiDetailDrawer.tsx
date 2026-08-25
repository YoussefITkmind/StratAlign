"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { KpiLibraryRow } from "@/types/kpi-workspace";

const PERSPECTIVE_LABEL: Record<KpiLibraryRow["perspective"], string> = {
  financial: "Financial",
  customer: "Customer",
  internal: "Internal",
  learning: "Learning",
};

const STATUS_META: Record<KpiLibraryRow["status"], { label: string; bg: string; text: string; dot: string }> = {
  "on-track": { label: "On Track", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "at-risk": { label: "At Risk", bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  behind: { label: "Behind", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
};

const APPROVAL_LABEL: Record<KpiLibraryRow["approval"], string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
};

const TABS = ["Overview", "History", "Comments", "Approval"] as const;

function TrendChart({ values, favorable }: { values: number[]; favorable: boolean }) {
  if (values.length < 2) return <div className="flex h-24 items-center justify-center text-sm text-gray-400">No measurement history yet.</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 320;
  const h = 90;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 10) - 5;
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const color = favorable ? "#10b981" : "#f59e0b";
  return <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full"><polygon points={area} fill={color} opacity={0.12} /><polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />{points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 3.5 : 2.5} fill={color} />)}</svg>;
}

export default function KpiDetailDrawer({ row, onClose }: { row: KpiLibraryRow; onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const statusMeta = STATUS_META[row.status];

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}><div className="app-scroll flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}><div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-5 pb-4 pt-5"><div className="flex items-start justify-between gap-3"><div><p className={`text-xs font-semibold uppercase tracking-wide ${statusMeta.text}`}>{PERSPECTIVE_LABEL[row.perspective]} · {row.department}</p><h2 className="mt-1 text-lg font-bold text-gray-900">{row.name}</h2></div><button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><div className="mt-4 flex gap-4 border-b border-gray-100">{TABS.map((item) => <button key={item} onClick={() => setTab(item)} className={`-mb-px border-b-2 px-0.5 pb-2 text-sm font-medium uppercase tracking-wide ${tab === item ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400"}`}>{item}</button>)}</div></div><div className="flex-1 space-y-5 p-5">
    {tab === "Overview" && <><div className="grid grid-cols-3 gap-3"><StatCard label="Actual" value={row.actual} /><StatCard label="Target" value={row.target} /><StatCard label="Variance" value={row.variance} tone={row.favorable ? "text-emerald-600" : "text-red-500"} /></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Measurement Trend</p><div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3"><TrendChart values={row.trend} favorable={row.favorable} /></div></div><dl className="space-y-3 border-t border-gray-100 pt-4"><DetailRow label="Owner"><span className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${row.owner.color}`}>{row.owner.initials}</span>{row.owner.name}</span></DetailRow><DetailRow label="Department">{row.department}</DetailRow><DetailRow label="Frequency">{row.freq}</DetailRow><DetailRow label="Aligned Objective">{row.tag}</DetailRow><DetailRow label="Status"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.bg} ${statusMeta.text}`}><span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />{statusMeta.label}</span></DetailRow><DetailRow label="Approval">{APPROVAL_LABEL[row.approval]}</DetailRow><DetailRow label="Data Source">{row.dataSourceType === "feed" ? "Feed" : "Manual"}</DetailRow>{row.period && <DetailRow label="Latest Period">{row.period}</DetailRow>}</dl><div className="border-t border-gray-100 pt-4"><p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Description</p><p className="text-sm leading-relaxed text-gray-600">{row.description ?? `${row.name} is aligned to ${row.tag} and reported ${row.freq.toLowerCase()}.`}</p></div></>}
    {tab === "History" && <div className="space-y-2">{row.trend.length > 0 ? row.trend.map((value, index) => <div key={index} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"><span className="text-gray-500">Period {index + 1}</span><span className="font-medium text-gray-900">{value}</span></div>) : <p className="text-sm text-gray-400">No measurements yet.</p>}</div>}
    {tab === "Comments" && <p className="text-sm text-gray-400">Commentary is stored in the Performance module and can be managed through KPI performance workflows.</p>}
    {tab === "Approval" && <div className="rounded-lg border border-gray-100 p-4 text-sm"><p className="text-gray-500">Current Registry lifecycle</p><p className="mt-1 font-semibold text-gray-900">{APPROVAL_LABEL[row.approval]}</p></div>}
  </div></div></div>;
}

function StatCard({ label, value, tone = "text-gray-900" }: { label: string; value: string; tone?: string }) { return <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-center"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className={`mt-1 text-base font-bold ${tone}`}>{value}</p></div>; }
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-4 text-sm"><span className="text-gray-400">{label}</span><span className="text-right font-medium text-gray-700">{children}</span></div>; }

"use client";

import { useState } from "react";
import { ArrowLeft, Link2, MessageSquare, Send, Workflow } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import LinkedInitiativesPanel from "./LinkedInitiativesPanel";

interface Props { kpiId: string; onBack: () => void; onNavigateKpi: (id: string) => void; onEditDefinition: (id: string) => void }
const number = (value: number | null | undefined, unit: string) => value == null ? "—" : `${value.toLocaleString()} ${unit}`;
const statusClass = (status: string | null | undefined) => status === "on_track" || status === "on-track" || status === "green" ? "bg-emerald-50 text-emerald-700" : status === "at_risk" || status === "at-risk" || status === "amber" ? "bg-amber-50 text-amber-700" : status ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-500";

export default function KpiDetailView({ kpiId, onBack, onNavigateKpi, onEditDefinition }: Props) {
  const utils = trpc.useUtils();
  const detail = trpc.capture.detail.useQuery({ kpiDefinitionId: kpiId });
  const [bodyEn, setBodyEn] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const addCommentary = trpc.capture.addCommentary.useMutation({
    onSuccess: async () => { setBodyEn(""); setBodyAr(""); await utils.capture.detail.invalidate({ kpiDefinitionId: kpiId }); },
  });
  if (detail.isLoading) return <p className="p-8 text-sm text-gray-500">Loading persisted KPI detail…</p>;
  if (detail.error) return <div className="p-8"><p role="alert" className="text-sm text-red-600">{detail.error.message}</p><button onClick={onBack} className="mt-3 text-sm text-blue-600">← Back</button></div>;
  const data = detail.data;
  if (!data) return <div className="p-8"><p className="text-sm text-gray-500">This persisted KPI could not be found.</p><button onClick={onBack} className="mt-3 text-sm text-blue-600">← Back</button></div>;
  const measurements = data.measurements.filter((row) => !data.scopeNodeId || row.scopeNodeId === data.scopeNodeId);
  const targets = data.targets.filter((row) => !data.scopeNodeId || row.scopeNodeId === data.scopeNodeId);
  const latest = measurements.at(-1);
  const target = [...targets].reverse().find((row) => !latest || row.period === latest.period) ?? targets.at(-1);
  const status = [...data.statuses].reverse().find((row) => !latest || row.period === latest.period)?.status ?? null;
  const baseline = measurements[0];
  const trend = measurements.length > 1 ? latest!.value - measurements.at(-2)!.value : null;
  const submit = () => {
    if (!data.scopeNodeId || !data.period || (!bodyEn.trim() && !bodyAr.trim())) return;
    addCommentary.mutate({ kpiVersionId: data.version.id, scopeNodeId: data.scopeNodeId, period: data.period, ...(bodyEn.trim() ? { bodyEn: bodyEn.trim() } : {}), ...(bodyAr.trim() ? { bodyAr: bodyAr.trim() } : {}) });
  };
  return <div className="mx-auto max-w-[1100px] space-y-5">
    <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-500"><ArrowLeft className="h-4 w-4"/> Back to KPI Registry</button>
    <header className="flex justify-between gap-4"><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{data.version.nameEn}</h1><span className={`rounded-full px-2 py-1 text-xs ${statusClass(status)}`}>{status ?? "No computed status"}</span></div><p dir="rtl" className="text-gray-500">{data.version.nameAr}</p><p className="mt-2 text-sm text-gray-500">v{data.version.version} · {data.version.ownerName} · {data.version.frequency}</p></div><button onClick={() => onEditDefinition(kpiId)} className="h-fit rounded border px-3 py-2 text-sm">Edit definition</button></header>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-5">{[["Actual",number(latest?.value,data.version.unit)],["Target",number(target?.targetValue,data.version.unit)],["Variance",latest&&target?number(latest.value-target.targetValue,data.version.unit):"—"],["Baseline",number(baseline?.value,data.version.unit)],["Trend",trend==null?"—":number(trend,data.version.unit)]].map(([label,value])=><div key={label} className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-gray-400">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>)}</section>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Persisted trend and targets</h2><p className="mt-1 text-xs text-gray-500">Threshold binding: {data.thresholdBinding ? `${data.thresholdBinding.ruleKey} v${data.thresholdBinding.ruleVersion}` : "No active Registry binding"}</p><div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-gray-400"><th>Period</th><th>Actual</th><th>Target</th><th>Status</th></tr></thead><tbody>{measurements.map(row=>{const t=targets.find(x=>x.period===row.period);const s=[...data.statuses].reverse().find(x=>x.scopeNodeId===row.scopeNodeId&&x.period===row.period);return <tr key={row.id} className="border-t"><td className="py-2">{row.period}</td><td>{number(row.value,data.version.unit)}</td><td>{number(t?.targetValue,data.version.unit)}</td><td><span className={`rounded px-2 py-1 text-xs ${statusClass(s?.status)}`}>{s?.status??"—"}</span></td></tr>})}</tbody></table>{measurements.length===0&&<p className="py-5 text-sm text-gray-400">No persisted measurements yet.</p>}</div></section>
    <section className="rounded-xl border bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><Workflow className="h-4 w-4"/> Contributor roll-up</h2>{data.rollups.at(-1)&&<p className="mt-1 text-xs text-gray-500">Latest persisted roll-up: {number(data.rollups.at(-1)?.aggregatedValue,data.version.unit)} ({data.rollups.at(-1)?.method})</p>}<div className="mt-3 space-y-2">{data.contributors.map(child=><button key={child.definitionId} onClick={()=>onNavigateKpi(child.definitionId)} className="flex w-full justify-between rounded border p-3 text-left"><span>{child.nameEn}</span><span>{number(child.value,child.unit)} · {child.status??"No status"}</span></button>)}{data.contributors.length===0&&<p className="text-sm text-gray-400">No persisted contributor hierarchy.</p>}</div></section>
    <section className="rounded-xl border bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4"/> Strategy alignment</h2>{data.alignments.map(a=><p key={a.id} className="mt-2 text-sm">{a.strategyNodeName} <span className="text-gray-400">· {a.strategyNodeType} · {a.alignmentType}</span></p>)}{data.alignments.length===0&&<p className="mt-2 text-sm text-gray-400">No persisted strategy alignment.</p>}</section>
    <div className="grid gap-5 lg:grid-cols-3"><section className="rounded-xl border bg-white p-5 lg:col-span-2"><h2 className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4"/> Commentary</h2>{data.scopeNodeId&&data.period?<><textarea value={bodyEn} onChange={e=>setBodyEn(e.target.value)} placeholder="Add commentary" className="mt-3 w-full rounded border p-2 text-sm"/><textarea value={bodyAr} onChange={e=>setBodyAr(e.target.value)} dir="rtl" placeholder="أضف تعليقًا" className="mt-2 w-full rounded border p-2 text-sm"/><button disabled={addCommentary.isPending} onClick={submit} className="mt-2 flex items-center gap-1 rounded bg-slate-900 px-3 py-2 text-sm text-white"><Send className="h-4 w-4"/> Post</button></>:<p className="mt-2 text-sm text-gray-400">Commentary becomes available when a persisted scope and period exist.</p>}{addCommentary.error&&<p role="alert" className="mt-2 text-sm text-red-600">{addCommentary.error.message}</p>}<div className="mt-4 space-y-3 border-t pt-3">{data.commentary.map(c=><div key={c.id}><p className="text-sm font-medium">{c.authorName} <span className="font-normal text-gray-400">{new Date(c.createdAt).toLocaleString()}</span></p>{c.bodyEn&&<p className="text-sm text-gray-600">{c.bodyEn}</p>}{c.bodyAr&&<p dir="rtl" className="text-sm text-gray-600">{c.bodyAr}</p>}</div>)}{data.commentary.length===0&&<p className="text-sm text-gray-400">No persisted commentary.</p>}</div></section><LinkedInitiativesPanel/></div>
  </div>;
}

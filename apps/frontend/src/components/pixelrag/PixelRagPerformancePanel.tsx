"use client";

import { useState } from "react";
import { Activity, BellRing, Check, LineChart, Search } from "lucide-react";

import { trpc } from "@/lib/trpc/client";

export default function PixelRagPerformancePanel() {
  const [kpiName, setKpiName] = useState("");
  const [requestedKpi, setRequestedKpi] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const forecast = trpc.pixelrag.forecast.useQuery(
    { kpiName: requestedKpi ?? "__inactive__" },
    { enabled: Boolean(requestedKpi) },
  );
  const lineage = trpc.pixelrag.lineage.useQuery(
    { kpiName: requestedKpi ?? "__inactive__" },
    { enabled: Boolean(requestedKpi) },
  );
  const alerts = trpc.pixelrag.alerts.useQuery();
  const acknowledge = trpc.pixelrag.acknowledgeAlert.useMutation();

  const runLookup = () => {
    const value = kpiName.trim();
    if (!value) return;
    setRequestedKpi(value);
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      await acknowledge.mutateAsync({ alertId });
      await Promise.all([utils.pixelrag.alerts.invalidate(), utils.pixelrag.audit.invalidate()]);
    } catch {
      // Mutation error is rendered below.
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-50 p-2"><LineChart className="h-5 w-5 text-emerald-700" /></div>
          <div>
            <h2 className="font-semibold text-gray-900">KPI forecast & lineage</h2>
            <p className="text-sm text-gray-500">Inspect the isolated POC measurement history and its explainable trend forecast.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <input
            value={kpiName}
            onChange={(event) => setKpiName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") runLookup(); }}
            placeholder="Enter an exact KPI name"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button type="button" onClick={runLookup} disabled={!kpiName.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
            <Search className="h-4 w-4" /> Inspect KPI
          </button>
        </div>

        {(forecast.error || lineage.error) && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{forecast.error?.message ?? lineage.error?.message}</div>
        )}
      </section>

      {requestedKpi && (forecast.data || lineage.data) && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900">Forecast · {requestedKpi}</h2>
            {forecast.isLoading ? (
              <p className="mt-4 text-sm text-gray-500">Calculating trend…</p>
            ) : forecast.data ? (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="History points" value={forecast.data.history.length} />
                  <Metric label="Next period" value={forecast.data.forecast_value ?? "Insufficient history"} />
                </div>
                <div className="space-y-2">
                  {forecast.data.history.map((point) => (
                    <div key={`${point.period}-${point.actual}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="text-gray-500">{point.period}</span><span className="font-medium text-gray-900">{point.actual}</span>
                    </div>
                  ))}
                </div>
                {forecast.data.history.length < 3 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Trend forecasts based on fewer than three periods are not displayed as reliable management forecasts. Add more measurements before using the result for decisions.</div>
                )}
                {forecast.data.note && <p className="text-xs leading-5 text-gray-500">{forecast.data.note}</p>}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900">Measurement lineage</h2>
            <p className="mt-1 text-sm text-gray-500">Period, source document, confidence and recorded value.</p>
            {lineage.isLoading ? (
              <p className="mt-4 text-sm text-gray-500">Loading lineage…</p>
            ) : lineage.data?.measurements.length ? (
              <div className="mt-4 space-y-2">
                {lineage.data.measurements.map((measurement) => (
                  <article key={measurement.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-4"><span className="text-sm font-medium text-gray-900">{measurement.period}</span><span className="text-sm font-semibold text-gray-900">{measurement.actual}</span></div>
                    <p className="mt-1 text-xs text-gray-500">{measurement.source_document_name ?? "No source document"}{measurement.confidence === null ? "" : ` · ${Math.round(measurement.confidence * 100)}% confidence`}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">No stored measurements were found for this KPI.</p>
            )}
          </section>
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="rounded-lg bg-amber-50 p-2"><BellRing className="h-5 w-5 text-amber-700" /></div>
          <div><h2 className="font-semibold text-gray-900">Performance alerts</h2><p className="text-sm text-gray-500">Operational alerts retained inside the PixelRAG POC dataset.</p></div>
        </div>
        {alerts.isLoading ? (
          <p className="p-5 text-sm text-gray-500">Loading alerts…</p>
        ) : alerts.error ? (
          <p role="alert" className="p-5 text-sm text-red-600">{alerts.error.message}</p>
        ) : !alerts.data?.length ? (
          <p className="p-5 text-sm text-gray-500">No alerts are currently recorded.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {alerts.data.map((alert) => (
              <article key={alert.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Severity severity={alert.severity} />
                    <p className="text-sm font-semibold text-gray-900">{alert.title}</p>
                    {alert.acknowledged && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="h-3 w-3" /> acknowledged</span>}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{alert.message}</p>
                  <p className="mt-1 text-xs text-gray-400">{alert.kpi_name ?? alert.kind} · {new Date(alert.created_at).toLocaleString()}</p>
                </div>
                {!alert.acknowledged && (
                  <button type="button" onClick={() => void acknowledgeAlert(alert.id)} disabled={acknowledge.isPending} className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Acknowledge</button>
                )}
              </article>
            ))}
          </div>
        )}
        {acknowledge.error && <p role="alert" className="px-5 pb-4 text-sm text-red-600">{acknowledge.error.message}</p>}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-lg font-semibold text-gray-900">{value}</p></div>;
}

function Severity({ severity }: { severity: "info" | "warning" | "critical" }) {
  const classes = severity === "critical" ? "bg-red-50 text-red-700" : severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${classes}`}><Activity className="h-3 w-3" />{severity}</span>;
}

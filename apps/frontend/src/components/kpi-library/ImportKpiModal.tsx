"use client";

import { useRef, useState } from "react";
import { X, Upload, FileSpreadsheet } from "lucide-react";
import { Direction, Kpi, Unit } from "@/types/kpi";
import { colorForInitials } from "@/lib/kpiConfig";
import { DOMAIN_OPTIONS } from "@/lib/catalogConfig";
import { buildDefaultRule } from "@/lib/ruleEngine";
import { useKpiStore } from "@/components/providers/KpiStoreProvider";

interface PreviewRow {
  name: string; domain: string; department: string; unit: string; direction: string; target: string; baseline: string; owner: string;
  valid: boolean; reason?: string;
}

const TEMPLATE = "name,domain,department,unit,direction,target,baseline,owner\nAverage Handle Time,Customer Experience,Support,number,lower-better,6,8,Jamie Park\n";

function parseCsv(text: string): string[][] {
  return text.trim().split(/\r?\n/).map((line) => line.split(",").map((c) => c.trim()));
}

export default function ImportKpiModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { addKpi } = useKpiStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kpi-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const [, ...dataRows] = parseCsv(String(reader.result ?? ""));
      const preview: PreviewRow[] = dataRows.filter((r) => r.length >= 8).map((r) => {
        const [name, domain, department, unit, direction, target, baseline, owner] = r;
        const valid = !!name && !Number.isNaN(Number(target)) && !Number.isNaN(Number(baseline));
        return { name, domain, department, unit, direction, target, baseline, owner, valid, reason: valid ? undefined : "Missing name or non-numeric target/baseline" };
      });
      setRows(preview);
    };
    reader.readAsText(file);
  };

  const commit = () => {
    if (!rows) return;
    rows.filter((r) => r.valid).forEach((r) => {
      const initials = r.owner.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "NA";
      const id = `kpi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const direction: Direction = r.direction === "lower-better" ? "lower-better" : "higher-better";
      const target = Number(r.target);
      const baseline = Number(r.baseline);
      const rule = buildDefaultRule(id, target, direction);
      const kpi: Kpi = {
        id, name: r.name, tag: r.domain || "General", perspective: "financial", department: r.department || "Unassigned",
        owner: { initials, name: r.owner || "Unassigned", color: colorForInitials(initials) },
        unit: (r.unit as Unit) || "number", direction, actual: baseline, target, baseline,
        frequency: "monthly", approval: "draft", status: "at-risk", ruleId: rule.id, history: [], comments: [],
        title: { en: r.name, ar: "" }, description: { en: "Imported via bulk template.", ar: "" },
        domain: DOMAIN_OPTIONS.includes(r.domain as (typeof DOMAIN_OPTIONS)[number]) ? r.domain : DOMAIN_OPTIONS[0],
        source: "Bulk Import", usageCount: 0, alignedNodeIds: [], retired: false,
        versions: [{ id: `${id}-v1`, version: 1, editedBy: r.owner || "Unassigned", editedAt: new Date().toISOString(), changeType: "created", summary: "Imported via bulk CSV template." }],
      };
      addKpi(kpi);
    });
    onImported();
  };

  const validCount = rows?.filter((r) => r.valid).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Import KPIs</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!rows ? (
          <div className="space-y-3">
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
              <FileSpreadsheet className="h-4 w-4" /> Download CSV template
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-8 text-sm text-gray-500 hover:border-gray-400 hover:bg-gray-50"
            >
              <Upload className="h-4 w-4" /> Choose a completed CSV to upload
            </button>
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">{validCount} of {rows.length} rows are ready to import.</p>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{r.name || "(no name)"}</p>
                      {!r.valid && <p className="text-xs text-red-500">{r.reason}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${r.valid ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {r.valid ? "Ready" : "Rejected"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRows(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Choose different file</button>
              <button onClick={commit} disabled={validCount === 0} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                Import {validCount} KPI{validCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

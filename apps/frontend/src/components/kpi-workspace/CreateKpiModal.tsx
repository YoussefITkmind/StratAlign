"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { PERSPECTIVE_META } from "./KpiLibraryTable";
import type { KpiLibraryRow, KpiPerspective } from "@/data/mockKpiLibrary";
import { trpc } from "@/lib/trpc/client";

const PERSPECTIVES: KpiPerspective[] = ["financial", "customer", "internal", "learning"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not generate a suggestion.";
}

const OWNER_COLOR_CYCLE = ["bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-cyan-600", "bg-violet-600"];

function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function hashCode(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return hash;
}

export default function CreateKpiModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (row: KpiLibraryRow) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");
  const [perspective, setPerspective] = useState<KpiPerspective>("financial");
  const [actual, setActual] = useState("");
  const [target, setTarget] = useState("");
  const [freq, setFreq] = useState<"Weekly" | "Monthly" | "Quarterly">("Monthly");
  const [ownerName, setOwnerName] = useState("");
  const [description, setDescription] = useState("");

  const [themeNodeId, setThemeNodeId] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  type AiFields = { name: string; description: string; freq: typeof freq };
  /** Snapshot of the AI-touched fields right before the last suggestion was applied. */
  const [priorSnapshot, setPriorSnapshot] = useState<AiFields | null>(null);
  /** Snapshot of the AI-touched fields exactly as applied — used to detect hand-edits. */
  const [appliedSnapshot, setAppliedSnapshot] = useState<AiFields | null>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);

  const nodes = trpc.strategy.nodes.useQuery();
  const themes = useMemo(
    () => (nodes.data ?? []).filter((node) => node.type === "theme" && node.state !== "retired"),
    [nodes.data],
  );
  const generate = trpc.aiSuggestion.generate.useMutation();

  const hasHandEdited =
    appliedSnapshot !== null &&
    (name !== appliedSnapshot.name || description !== appliedSnapshot.description || freq !== appliedSnapshot.freq);

  const valid = name.trim().length > 0;

  const applySuggestion = (suggestion: {
    titleEn: string;
    descriptionEn: string | null;
    kpi: { frequency: "monthly" | "quarterly" } | null;
  }) => {
    setPriorSnapshot({ name, description, freq });
    const nextName = name.trim().length > 0 ? name : suggestion.titleEn;
    const nextDescription = suggestion.descriptionEn ?? description;
    const nextFreq: typeof freq =
      suggestion.kpi?.frequency === "quarterly" ? "Quarterly" : suggestion.kpi?.frequency === "monthly" ? "Monthly" : freq;
    setName(nextName);
    setDescription(nextDescription);
    setFreq(nextFreq);
    setAppliedSnapshot({ name: nextName, description: nextDescription, freq: nextFreq });
  };

  const runAiSuggest = async (force = false) => {
    if (!themeNodeId || generate.isPending) return;
    if (hasHandEdited && !force) {
      setConfirmingRegenerate(true);
      return;
    }
    setConfirmingRegenerate(false);
    setAiError(null);
    setAiNotice(null);
    try {
      const result = await generate.mutateAsync({ themeNodeId, kinds: ["kpi"], maxSuggestions: 1 });
      const suggestion = result.suggestions[0];
      if (!suggestion) {
        setAiNotice("No suggestion available for this theme — continue manually.");
        return;
      }
      applySuggestion(suggestion);
    } catch (cause) {
      setAiError(errorMessage(cause));
    }
  };

  const discardSuggestion = () => {
    if (!priorSnapshot) return;
    setName(priorSnapshot.name);
    setDescription(priorSnapshot.description);
    setFreq(priorSnapshot.freq);
    setPriorSnapshot(null);
    setAppliedSnapshot(null);
    setAiNotice(null);
    setAiError(null);
  };

  const handleCreate = () => {
    if (!valid) return;
    const owner = ownerName.trim();
    onCreate({
      id: `kpi-custom-${Date.now()}`,
      name: name.trim(),
      tag: category.trim() || "General",
      perspective,
      department: department.trim() || "Unassigned",
      owner: {
        initials: initialsOf(owner || "New Owner"),
        name: owner || "Unassigned",
        color: OWNER_COLOR_CYCLE[Math.abs(hashCode(name.trim())) % OWNER_COLOR_CYCLE.length],
      },
      actual: actual.trim() || "—",
      target: target.trim() || "—",
      variance: "—",
      favorable: true,
      trend: [0, 0, 0, 0, 0, 0],
      freq,
      approval: "draft",
      status: "on-track",
      description: description.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div role="dialog" aria-modal="true" aria-labelledby="create-kpi-title" className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h2 id="create-kpi-title" className="text-lg font-semibold text-gray-900">Create KPI</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="app-scroll flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                data-testid="kpi-ai-theme-select"
                value={themeNodeId}
                onChange={(e) => setThemeNodeId(e.target.value)}
                disabled={nodes.isLoading || nodes.isError}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 outline-none focus:border-indigo-500"
              >
                <option value="">
                  {nodes.isLoading ? "Loading themes…" : themes.length === 0 ? "No themes yet" : "Select a theme…"}
                </option>
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.nameEn}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid="kpi-ai-suggest"
                onClick={() => void runAiSuggest()}
                disabled={!themeNodeId || generate.isPending}
                className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI Suggest
              </button>
              {priorSnapshot && (
                <button
                  type="button"
                  data-testid="kpi-ai-discard"
                  onClick={discardSuggestion}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  Discard suggestion
                </button>
              )}
            </div>
            {confirmingRegenerate && (
              <div data-testid="kpi-ai-confirm" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-700">
                You&apos;ve edited the AI-filled fields. Replace them with a new suggestion?
                <button type="button" onClick={() => void runAiSuggest(true)} className="font-medium underline">
                  Replace
                </button>
                <button type="button" onClick={() => setConfirmingRegenerate(false)} className="font-medium underline">
                  Cancel
                </button>
              </div>
            )}
            {aiError && (
              <p data-testid="kpi-ai-error" className="mt-2 text-sm text-red-600">
                {aiError}
              </p>
            )}
            {aiNotice && (
              <p data-testid="kpi-ai-notice" className="mt-2 text-sm text-gray-500">
                {aiNotice}
              </p>
            )}
          </div>

          <Field label="KPI Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Revenue Growth (YoY)"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Revenue" className={inputClass} />
            </Field>
            <Field label="Department">
              <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sales" className={inputClass} />
            </Field>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">
              BSC Perspective <span className="text-red-500">*</span>
            </span>
            <div role="group" aria-label="BSC Perspective" className="grid grid-cols-4 gap-2">
              {PERSPECTIVES.map((key) => {
                const meta = PERSPECTIVE_META[key];
                const Icon = meta.icon;
                const active = perspective === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPerspective(key)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs font-medium transition ${
                      active ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Actual Value">
              <input value={actual} onChange={(e) => setActual(e.target.value)} placeholder="e.g. 38%" className={inputClass} />
            </Field>
            <Field label="Target Value">
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 40%" className={inputClass} />
            </Field>
            <Field label="Frequency">
              <select value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)} className={inputClass}>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
              </select>
            </Field>
          </div>

          <Field label="Owner Name">
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Sarah Chen" className={inputClass} />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this KPI..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={!valid}
            onClick={handleCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Create KPI
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

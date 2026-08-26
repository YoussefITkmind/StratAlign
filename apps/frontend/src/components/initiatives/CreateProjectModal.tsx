"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useOwnerOptions } from "@/components/initiatives/useOwnerOptions";

const PRIORITIES = [
  { key: "Critical", value: "critical", dot: "bg-red-500" },
  { key: "High", value: "high", dot: "bg-orange-500" },
  { key: "Medium", value: "medium", dot: "bg-blue-500" },
  { key: "Low", value: "low", dot: "bg-emerald-500" },
] as const;

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

function isValidOptionalUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    new URL(value.trim());
    return true;
  } catch {
    return false;
  }
}

export function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [parentInitiativeId, setParentInitiativeId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]["value"]>("medium");
  const [jiraBoardUrl, setJiraBoardUrl] = useState("");
  const [confluenceSpaceUrl, setConfluenceSpaceUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const initiatives = trpc.execution.initiative.list.useQuery({ scope: "all" });
  const owners = useOwnerOptions();

  const create = trpc.execution.project.create.useMutation({ onSuccess: onCreated });

  const nameValid = name.trim().length > 0;

  const validate = (): string | null => {
    if (!nameValid) return "Project name is required.";
    if (!ownerUserId.trim()) return "Owner is required.";
    if (startDate && endDate && endDate < startDate) return "End date cannot be before the start date.";
    if (budget.trim() && (!Number.isFinite(Number(budget)) || Number(budget) < 0)) return "Budget must be a valid, non-negative number.";
    if (!isValidOptionalUrl(jiraBoardUrl)) return "Enter a valid Jira board URL.";
    if (!isValidOptionalUrl(confluenceSpaceUrl)) return "Enter a valid Confluence space URL.";
    return null;
  };

  const submit = () => {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    create.mutate({
      name: name.trim(),
      description: description.trim() || null,
      department: department.trim() || null,
      ownerUserId: ownerUserId.trim(),
      parentInitiativeId: parentInitiativeId || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      budgetAmount: budget.trim() ? Number(budget) : null,
      priority,
      jiraBoardUrl: jiraBoardUrl.trim() || null,
      confluenceSpaceUrl: confluenceSpaceUrl.trim() || null,
    });
  };

  const errorText = formError ?? (create.error ? message(create.error) : null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        data-testid="new-project-form"
        className="my-4 flex max-h-[90vh] w-full max-w-[92vw] flex-col rounded-2xl bg-white shadow-xl sm:my-0 sm:max-w-lg"
      >
        <div className="flex items-start justify-between px-5 pt-5 sm:px-6 sm:pt-6">
          <div>
            <h2 className="text-[1.05rem] font-bold text-slate-900">Create Project</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-400">A concrete deliverable linked to an initiative</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto border-t border-slate-100 px-5 py-5 sm:px-6">
          <label className="block text-[13px] font-medium text-slate-700">
            Parent Initiative
            <select
              data-testid="project-parent-initiative"
              value={parentInitiativeId}
              onChange={(e) => setParentInitiativeId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— None / Standalone —</option>
              {(initiatives.data ?? []).map((initiative) => (
                <option key={initiative.id} value={initiative.id}>{initiative.nameEn}</option>
              ))}
            </select>
          </label>

          <label className="block text-[13px] font-medium text-slate-700">
            Project Name <span className="text-red-500">*</span>
            <input
              data-testid="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Salesforce CPQ Integration"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <label className="block text-[13px] font-medium text-slate-700">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What will this project deliver?"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-[13px] font-medium text-slate-700">
              Department
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Engineering"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block text-[13px] font-medium text-slate-700">
              Owner <span className="text-red-500">*</span>
              {owners.isRealData ? (
                <select
                  data-testid="project-owner"
                  value={ownerUserId}
                  onChange={(e) => setOwnerUserId(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select an owner…</option>
                  {owners.options.map((owner) => (
                    <option key={owner.id} value={owner.id}>{owner.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  data-testid="project-owner"
                  value={ownerUserId}
                  onChange={(e) => setOwnerUserId(e.target.value)}
                  placeholder="e.g. Priya Nair"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-[13px] font-medium text-slate-700">
              Start Date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block text-[13px] font-medium text-slate-700">
              End Date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
          </div>

          <label className="block text-[13px] font-medium text-slate-700">
            Budget ($)
            <input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="e.g. 50000"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>

          <div>
            <span className="block text-[13px] font-medium text-slate-700">Priority</span>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {PRIORITIES.map((p) => {
                const active = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPriority(p.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-[12.5px] font-medium transition ${
                      active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${active ? "bg-white" : p.dot}`} />
                    {p.key}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
            <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
              External Tool Links (optional)
            </span>
            <div className="mt-3 space-y-3">
              <label className="block text-[13px] font-medium text-slate-700">
                Jira
                <input
                  value={jiraBoardUrl}
                  onChange={(e) => setJiraBoardUrl(e.target.value)}
                  placeholder="Jira board URL"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </label>
              <label className="block text-[13px] font-medium text-slate-700">
                Confluence
                <input
                  value={confluenceSpaceUrl}
                  onChange={(e) => setConfluenceSpaceUrl(e.target.value)}
                  placeholder="Confluence space URL"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </label>
            </div>
          </div>

          {errorText && (
            <p role="alert" data-testid="project-create-error" className="text-[12.5px] text-red-600">
              {errorText}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            data-testid="submit-new-project"
            disabled={create.isPending || !nameValid}
            onClick={submit}
            className="rounded-xl bg-violet-600 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {create.isPending ? "Creating…" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

function message(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

export function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const initiatives = trpc.execution.initiative.list.useQuery({ scope: "all" });
  const [initiativeId, setInitiativeId] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [projectUrl, setProjectUrl] = useState("");

  const linkProject = trpc.execution.initiative.linkJira.useMutation({
    onSuccess: onCreated,
  });

  const valid = initiativeId.length > 0 && projectKey.trim().length > 0 && projectUrl.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    linkProject.mutate({
      initiativeId,
      jiraProjectKey: projectKey.trim(),
      jiraProjectUrl: projectUrl.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Create Project</h2>
            <p className="mt-1 text-sm text-slate-500">Link a project to an existing initiative.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Initiative <span className="text-red-500">*</span>
            <select
              value={initiativeId}
              onChange={(event) => setInitiativeId(event.target.value)}
              disabled={initiatives.isLoading}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
            >
              <option value="">{initiatives.isLoading ? "Loading initiatives…" : "Select an initiative…"}</option>
              {(initiatives.data ?? []).map((initiative) => (
                <option key={initiative.id} value={initiative.id}>{initiative.nameEn}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Project Key <span className="text-red-500">*</span>
            <input
              value={projectKey}
              onChange={(event) => setProjectKey(event.target.value)}
              placeholder="e.g. CRM"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Project URL <span className="text-red-500">*</span>
            <input
              value={projectUrl}
              onChange={(event) => setProjectUrl(event.target.value)}
              placeholder="https://your-company.atlassian.net/browse/CRM"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </label>

          {initiatives.error && <p className="text-sm text-red-600">{message(initiatives.error)}</p>}
          {linkProject.error && <p className="text-sm text-red-600">{message(linkProject.error)}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={submit} disabled={!valid || linkProject.isPending} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">
            {linkProject.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {linkProject.isPending ? "Creating…" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

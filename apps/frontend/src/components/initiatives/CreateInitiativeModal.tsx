"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

const STEPS = ["Basic Info", "Details", "Team & Budget"] as const;

const STAGES = ["design", "pilot", "execute", "scale", "done"] as const;
const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  design: "Design",
  pilot: "Pilot",
  execute: "Execute",
  scale: "Scale",
  done: "Done",
};

const PRIORITIES = [
  { key: "Critical", dot: "bg-red-500" },
  { key: "High", dot: "bg-orange-500" },
  { key: "Medium", dot: "bg-blue-500" },
  { key: "Low", dot: "bg-emerald-500" },
] as const;

function message(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

export function CreateInitiativeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);

  // Basic Info
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]["key"]>("Medium");

  // Details
  const [strategicPlayNodeId, setStrategicPlayNodeId] = useState("");
  const [stage, setStage] = useState<(typeof STAGES)[number]>("design");
  const [department, setDepartment] = useState("");
  const [playError, setPlayError] = useState(false);

  // Team & Budget
  const [ownerUserId, setOwnerUserId] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [budget, setBudget] = useState("");

  const nodes = trpc.strategy.nodes.useQuery();
  const plays = nodes.data?.filter((node) => node.type === "strategic_play" && node.state === "active") ?? [];

  const register = trpc.execution.initiative.register.useMutation({
    onSuccess: onCreated,
  });

  const step1Valid = nameEn.trim().length > 0 && nameAr.trim().length > 0;
  const step3Valid = ownerUserId.trim().length > 0;

  const goNext = () => {
    if (step === 1 && !strategicPlayNodeId) {
      setPlayError(true);
      return;
    }
    setPlayError(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = () => {
    if (!strategicPlayNodeId) {
      setStep(1);
      setPlayError(true);
      return;
    }
    register.mutate({ nameEn, nameAr, strategicPlayNodeId, ownerUserId, stage });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:items-center sm:p-6">
      <div
        data-testid="new-initiative-form"
        className="my-4 w-full max-w-[92vw] rounded-2xl bg-white shadow-xl sm:my-0 sm:max-w-md"
      >
        <div className="flex items-start justify-between px-5 pt-5 sm:px-6 sm:pt-6">
          <div>
            <h2 className="text-[1.05rem] font-bold text-slate-900">Create Initiative</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-400">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 border-b border-slate-100 px-5 pb-4 sm:px-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2 last:flex-none">
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    i < step
                      ? "bg-blue-600 text-white"
                      : i === step
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={`hidden text-[12.5px] font-medium sm:inline ${i === step ? "text-slate-900" : "text-slate-400"}`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && <span className={`h-px flex-1 ${i < step ? "bg-blue-600" : "bg-slate-100"}`} />}
            </div>
          ))}
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-5 sm:px-6">
          {step === 0 && (
            <div className="space-y-4">
              <label className="block text-[13px] font-medium text-slate-700">
                Initiative Name <span className="text-red-500">*</span>
                <input
                  data-testid="initiative-name-en"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="e.g. CRM Platform Migration"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </label>
              <label className="block text-[13px] font-medium text-slate-700">
                Initiative Name (Arabic) <span className="text-red-500">*</span>
                <input
                  dir="rtl"
                  data-testid="initiative-name-ar"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </label>
              <label className="block text-[13px] font-medium text-slate-700">
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What will this initiative achieve?"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </label>
              <div>
                <span className="block text-[13px] font-medium text-slate-700">Priority</span>
                <div className="mt-1.5 grid grid-cols-4 gap-2">
                  {PRIORITIES.map((p) => {
                    const active = priority === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPriority(p.key)}
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
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <label className="block text-[13px] font-medium text-slate-700">
                Strategic Play <span className="text-red-500">*</span>
                <select
                  data-testid="initiative-play-select"
                  value={strategicPlayNodeId}
                  onChange={(e) => {
                    setStrategicPlayNodeId(e.target.value);
                    if (e.target.value) setPlayError(false);
                  }}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select a play…</option>
                  {plays.map((play) => (
                    <option key={play.id} value={play.id}>{play.nameEn}</option>
                  ))}
                </select>
                {playError && (
                  <p role="alert" data-testid="initiative-play-required-error" className="mt-1.5 text-[12.5px] text-red-600">
                    Select a strategic play before continuing.
                  </p>
                )}
              </label>
              <label className="block text-[13px] font-medium text-slate-700">
                Stage
                <select
                  data-testid="initiative-stage-select"
                  value={stage}
                  onChange={(e) => setStage(e.target.value as (typeof STAGES)[number])}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[13px] font-medium text-slate-700">
                Department
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Engineering"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <label className="block text-[13px] font-medium text-slate-700">
                Owner <span className="text-red-500">*</span>
                <input
                  data-testid="initiative-owner-id"
                  value={ownerUserId}
                  onChange={(e) => setOwnerUserId(e.target.value)}
                  placeholder="Owner user ID"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[13px] font-medium text-slate-700">
                  Team Size
                  <input
                    type="number"
                    min={0}
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value)}
                    placeholder="0"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <label className="block text-[13px] font-medium text-slate-700">
                  Budget
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">$</span>
                    <input
                      type="number"
                      min={0}
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-slate-200 py-2.5 pl-7 pr-3.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </label>
              </div>
              <p className="text-[11.5px] text-slate-400">
                Team size and budget aren&apos;t tracked by the Execution API yet — they won&apos;t be saved.
              </p>
            </div>
          )}

          {register.error && (
            <p role="alert" data-testid="initiative-register-error" className="mt-3 text-[12.5px] text-red-600">
              {message(register.error)}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
          <button
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50"
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={goNext}
              disabled={step === 0 && !step1Valid}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          ) : (
            <button
              data-testid="submit-new-initiative"
              disabled={register.isPending || !step3Valid}
              onClick={submit}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {register.isPending ? "Creating…" : "Create Initiative"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

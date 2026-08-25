"use client";

import { AlertTriangle, Info, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { STATUS_CONFIG } from "@/lib/strategyConfig";
import type { NodeStatus } from "@/types/strategy";
import EditableBriefSection, { type BriefSectionValue } from "./EditableBriefSection";

/** Mirrors the backend's `StrategyBrief` — see strategy-brief.types.ts. */
interface BriefTheme {
  id: string;
  name: string;
  objectiveCount: number;
}

interface BriefObjective {
  id: string;
  name: string;
  themeId: string | null;
  themeName: string | null;
  owner: string | null;
  progress: number | null;
  health: NodeStatus;
}

interface BriefRisk {
  severity: "low" | "medium" | "high";
  area: string | null;
  title: string;
  mitigation: string;
}

interface StrategyBriefData {
  rootNodeId: string;
  title: string;
  generatedAt: string;
  executiveSummary: BriefSectionValue;
  strategicVision: BriefSectionValue;
  strategicThemes: BriefTheme[];
  strategicObjectives: BriefObjective[];
  expectedOutcomes: string[];
  risks: BriefRisk[];
  insufficientData: boolean;
  insufficientDataReason: string | null;
  provider: string;
  model: string;
}

interface Props {
  canManage: boolean;
  onClose: () => void;
}

const SEVERITY_STYLE: Record<BriefRisk["severity"], string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

const SEVERITY_LABEL: Record<BriefRisk["severity"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Provider errors never reach here verbatim — the backend already fixed the text. */
function message(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "We couldn't generate the strategy brief. Please try again.";
}

/**
 * The AI-generated executive Strategy Brief.
 *
 * Everything rendered here comes from `strategyBrief.get` / `.generate` — this
 * component holds no fallback copy, no sample figures, and no derived numbers.
 * A theme's objective count, an owner's name, and a progress percentage are
 * displayed exactly as the backend computed them from the hierarchy, and an
 * absent value renders as an explicit "not measured" rather than as a zero.
 */
export default function StrategyBriefModal({ canManage, onClose }: Props) {
  const utils = trpc.useUtils();
  const briefQuery = trpc.strategyBrief.get.useQuery(undefined, { retry: false });
  const generate = trpc.strategyBrief.generate.useMutation();
  const updateSection = trpc.strategyBrief.updateSection.useMutation();

  const brief = (briefQuery.data ?? null) as StrategyBriefData | null;

  const runGenerate = async () => {
    await generate.mutateAsync(undefined);
    await utils.strategyBrief.get.invalidate();
  };

  const saveSection = async (
    section: "executiveSummary" | "strategicVision",
    content: string | null,
  ) => {
    await updateSection.mutateAsync({ section, content });
    await utils.strategyBrief.get.invalidate();
  };

  const isBusy = generate.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Strategy Brief"
        data-testid="strategy-brief-modal"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-indigo-50/60 p-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-900">
              {brief ? brief.title : "Strategy Brief"}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>
                AI-generated strategy brief
                {brief && ` · ${formatGeneratedAt(brief.generatedAt)}`}
              </span>
              <span
                data-testid="ai-generated-badge"
                className="flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
              >
                <Sparkles className="h-3 w-3" /> AI Generated
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canManage && brief && (
              <button
                type="button"
                data-testid="regenerate-brief"
                onClick={() => void runGenerate()}
                disabled={isBusy}
                className="flex items-center gap-1.5 rounded-full border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? "animate-spin" : ""}`} />
                Regenerate
              </button>
            )}
            <button
              type="button"
              aria-label="Close strategy brief"
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {briefQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 px-6 py-20 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading strategy brief…
            </div>
          )}

          {!briefQuery.isLoading && briefQuery.isError && (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center text-sm text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {message(briefQuery.error)}
            </div>
          )}

          {isBusy && (
            <div
              data-testid="brief-generating"
              className="flex items-center justify-center gap-2 px-6 py-20 text-sm text-gray-500"
            >
              <Loader2 className="h-4 w-4 animate-spin" /> Generating strategy brief…
            </div>
          )}

          {!isBusy && !briefQuery.isLoading && !briefQuery.isError && !brief && (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
              <p className="text-sm text-gray-500">
                No strategy brief has been generated yet.
              </p>
              {canManage ? (
                <button
                  type="button"
                  data-testid="generate-brief"
                  onClick={() => void runGenerate()}
                  className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <Sparkles className="h-4 w-4" /> Generate Strategy Brief
                </button>
              ) : (
                <p className="text-sm text-gray-400">
                  Ask a strategy administrator to generate one.
                </p>
              )}
            </div>
          )}

          {!isBusy && generate.isError && (
            <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {message(generate.error)}
            </div>
          )}

          {!isBusy && brief && (
            <>
              {brief.insufficientData && (
                <div
                  data-testid="brief-insufficient-data"
                  className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-6 py-3 text-sm text-amber-800"
                >
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    There isn&apos;t enough strategy data to generate a reliable brief yet.
                    {brief.insufficientDataReason && ` ${brief.insufficientDataReason}`}
                  </span>
                </div>
              )}

              <EditableBriefSection
                title="Executive Summary"
                testId="brief-executive-summary"
                section={brief.executiveSummary}
                emptyLabel="No executive summary is available for this strategy."
                canEdit={canManage}
                isSaving={updateSection.isPending}
                onSave={(content) => saveSection("executiveSummary", content)}
              />

              <EditableBriefSection
                title="Strategic Vision"
                testId="brief-strategic-vision"
                section={brief.strategicVision}
                emptyLabel="This strategy has no vision statement on record."
                canEdit={canManage}
                isSaving={updateSection.isPending}
                onSave={(content) => saveSection("strategicVision", content)}
              />

              {/* themes */}
              <section data-testid="brief-themes" className="border-t border-gray-100 px-6 py-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Strategic Themes
                </h3>
                {brief.strategicThemes.length === 0 ? (
                  <p className="text-sm italic text-gray-400">
                    This strategy has no themes yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {brief.strategicThemes.map((theme) => (
                      <li
                        key={theme.id}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                      >
                        <span className="truncate text-gray-900">{theme.name}</span>
                        <span className="shrink-0 text-gray-500">
                          {theme.objectiveCount} obj.
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* objectives */}
              <section
                data-testid="brief-objectives"
                className="border-t border-gray-100 px-6 py-5"
              >
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Strategic Objectives
                </h3>
                {brief.strategicObjectives.length === 0 ? (
                  <p className="text-sm italic text-gray-400">
                    This strategy has no objectives yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {brief.strategicObjectives.map((objective) => {
                      const statusCfg = STATUS_CONFIG[objective.health];
                      return (
                        <li key={objective.id} data-testid={`brief-objective-${objective.id}`}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-sm text-gray-900">
                              {objective.name}
                            </span>
                            <span className="shrink-0 text-sm font-medium text-gray-700">
                              {objective.progress === null ? "Not measured" : `${objective.progress}%`}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${statusCfg.dot}`} />
                            <span className="text-xs text-gray-500">
                              Owner: {objective.owner ?? "Not assigned"}
                            </span>
                            {objective.themeName && (
                              <span className="truncate rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                                {objective.themeName}
                              </span>
                            )}
                            <span className="ml-auto text-xs text-gray-400">
                              {statusCfg.label}
                            </span>
                          </div>
                          {objective.progress !== null && (
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className={`h-full rounded-full ${statusCfg.bar}`}
                                style={{ width: `${objective.progress}%` }}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* outcomes */}
              <section data-testid="brief-outcomes" className="border-t border-gray-100 px-6 py-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Expected Outcomes
                </h3>
                {brief.expectedOutcomes.length === 0 ? (
                  <p className="text-sm italic text-gray-400">
                    There is not enough strategy data to project expected outcomes.
                  </p>
                ) : (
                  <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">
                    {brief.expectedOutcomes.map((outcome) => (
                      <li key={outcome}>{outcome}</li>
                    ))}
                  </ul>
                )}
              </section>

              {/* risks */}
              <section data-testid="brief-risks" className="border-t border-gray-100 px-6 py-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Key Risks &amp; Mitigations
                </h3>
                {brief.risks.length === 0 ? (
                  <p data-testid="brief-no-risks" className="text-sm italic text-gray-400">
                    No risks were identified from the current strategy data.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {brief.risks.map((risk) => (
                      <li key={`${risk.severity}-${risk.title}`} className="rounded-lg border border-gray-200 p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_STYLE[risk.severity]}`}
                          >
                            {SEVERITY_LABEL[risk.severity]}
                          </span>
                          {risk.area && (
                            <span className="text-xs font-medium text-gray-600">{risk.area}</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-900">{risk.title}</p>
                        <p className="mt-0.5 text-sm text-gray-600">{risk.mitigation}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <p className="border-t border-gray-100 bg-gray-50 px-6 py-3 text-xs text-gray-500">
                AI-generated analysis based on current strategy data. Themes, objectives, owners,
                and progress figures are read directly from the hierarchy; the summary, outcomes,
                and risks are model-written and should be reviewed before use.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

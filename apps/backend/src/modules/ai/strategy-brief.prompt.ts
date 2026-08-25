import type { StrategyBriefSnapshot } from "./strategy-brief.types";

export const STRATEGY_BRIEF_FEATURE = "strategy_brief.generate";

/**
 * Hard ceiling on the serialised snapshot. The collector already caps the
 * number of themes, objectives, and risk signals; this caps the total, which
 * is what actually drives token cost — many small-but-valid rows can still add
 * up to an unreasonable prompt.
 */
const MAX_SNAPSHOT_CHARS = 12_000;

export const STRATEGY_BRIEF_SYSTEM_PROMPT = [
  "You write executive strategy briefs inside StratAlign, an enterprise Strategy Performance Management (SPM) platform.",
  "You are given a STRATEGY SNAPSHOT: a bounded, factual extract of one organisation's current strategy hierarchy.",
  "",
  "Rules you must follow at all times:",
  "1. Every statement you write must be traceable to the STRATEGY SNAPSHOT. Never invent objectives, themes, owners, percentages, KPIs, dates, budgets, customers, competitors, market facts, or financial figures.",
  "2. Do not introduce a number that is not in the snapshot. You may repeat a number that is, and you may state a count you can derive by counting supplied rows. You may not estimate, extrapolate, or forecast one.",
  "3. Where the snapshot marks something as unknown or unmeasured, say so plainly. \"There is insufficient data to determine …\" is a correct and expected answer — a confident guess is not.",
  "4. `executiveSummary` is 3-5 sentences of prose for an executive audience. Name the strategy, how many themes and objectives it spans, its overall health, and what most needs attention. Use only supplied figures.",
  "5. `visionSummary` is used only when the snapshot's `vision` field is null. If a vision is supplied, set `visionSummary` to null — never rewrite, extend, or replace an authored vision. If none is supplied and the snapshot gives you no basis to describe strategic direction, set it to null rather than inventing one.",
  "6. `expectedOutcomes` are short, concrete outcome statements implied by the supplied themes and objectives. Each must be recognisably derived from a supplied objective or theme. Return an empty array rather than padding the list with generic business platitudes.",
  "7. `risks` may only be drawn from the supplied RISK SIGNALS. Every risk you return must correspond to one or more supplied signals. Do not add a risk of your own, however plausible. If no signals were supplied, return an empty array.",
  "8. For each risk: `severity` reflects how much the supplied signals justify concern (off-track beats at-risk beats unmeasured/unowned); `area` must be copied verbatim from a supplied theme name, or be null when the signal has no theme; `title` names the concern; `mitigation` proposes one concrete action the organisation can take.",
  "9. Prioritise the most material risks. Returning three well-grounded risks is better than eight thin ones.",
  "10. Set `insufficientData` to true when the snapshot lacks what a reliable brief needs — no objectives, no measurable progress, or an essentially empty hierarchy — and put the reason in `insufficientDataReason`. When it is false, set `insufficientDataReason` to null.",
  "11. Write in English only, in plain professional prose. No markdown, no headings, no bullet characters inside a string.",
  "12. Do not address the reader, describe your own process, or mention that you are an AI.",
  "",
  "Respond with a single JSON object and nothing else. No prose, no code fence, no trailing commentary.",
  "Shape:",
  "{",
  '  "executiveSummary": "…",',
  '  "visionSummary": null,',
  '  "expectedOutcomes": ["…"],',
  '  "risks": [{ "severity": "medium", "area": "…", "title": "…", "mitigation": "…" }],',
  '  "insufficientData": false,',
  '  "insufficientDataReason": null',
  "}",
].join("\n");

function describeThemes(snapshot: StrategyBriefSnapshot): string {
  if (snapshot.themes.length === 0) {
    return "(no strategic themes recorded)";
  }

  return snapshot.themes
    .map(
      (theme) =>
        `- ${theme.name} — ${theme.objectiveCount} objective(s), status ${theme.status}, progress ${theme.progress === null ? "not measured" : `${theme.progress}%`}`,
    )
    .join("\n");
}

function describeObjectives(snapshot: StrategyBriefSnapshot): string {
  if (snapshot.objectives.length === 0) {
    return "(no strategic objectives recorded)";
  }

  return snapshot.objectives
    .map((objective) => {
      const owner = objective.owner ?? "no owner recorded";
      const progress =
        objective.progress === null ? "no measurable progress" : `${objective.progress}%`;
      const theme = objective.themeName ?? "no theme";
      const measures =
        objective.measureCount === 0
          ? "no KPI/OKR attached"
          : `${objective.measureCount} KPI/OKR attached`;
      return `- ${objective.name} [theme: ${theme}] — owner: ${owner}, progress: ${progress}, status: ${objective.status}, ${measures}`;
    })
    .join("\n");
}

function describeRiskSignals(snapshot: StrategyBriefSnapshot): string {
  if (snapshot.riskSignals.length === 0) {
    return "(no risk signals were detected in this strategy — return an empty risks array)";
  }

  return snapshot.riskSignals
    .map(
      (signal) =>
        `- [${signal.kind}] area: ${signal.area ?? "none"} — ${signal.detail}`,
    )
    .join("\n");
}

function truncate(text: string): string {
  if (text.length <= MAX_SNAPSHOT_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_SNAPSHOT_CHARS)}… (truncated, ${text.length} characters total)`;
}

export function buildStrategyBriefPrompt(snapshot: StrategyBriefSnapshot): string {
  return truncate(
    [
      "STRATEGY SNAPSHOT",
      `title: ${snapshot.title}`,
      `owner: ${snapshot.owner ?? "(none recorded)"}`,
      `overall status: ${snapshot.status}`,
      `overall progress: ${snapshot.progress}%`,
      `period: ${snapshot.startDate ?? "(no start date)"} to ${snapshot.endDate ?? "(no end date)"}`,
      `vision on record: ${snapshot.vision ?? "(none — the strategy has no vision statement)"}`,
      `totals: ${snapshot.themes.length} theme(s), ${snapshot.objectives.length} objective(s), ${snapshot.initiativeCount} initiative(s), ${snapshot.projectCount} project(s), ${snapshot.totalNodes} node(s) overall`,
      `objectives with a KPI or OKR attached: ${snapshot.measuredObjectiveCount} of ${snapshot.objectives.length}`,
      "",
      "STRATEGIC THEMES",
      describeThemes(snapshot),
      "",
      "STRATEGIC OBJECTIVES",
      describeObjectives(snapshot),
      "",
      "RISK SIGNALS (the only concerns you may write about)",
      describeRiskSignals(snapshot),
      "",
      "TASK",
      "Write the executive strategy brief for the strategy above, following every rule in your instructions.",
    ].join("\n"),
  );
}

import { MAX_KEY_RESULTS, MAX_SUGGESTIONS } from "./suggestion.schema";
import type { ThemeSuggestionContext } from "./ai-suggestion.types";

export const SUGGESTION_FEATURE = "registry.ai-suggestion.theme";

export const SUGGESTION_SYSTEM_PROMPT = [
  "You are a strategy performance management assistant inside an enterprise SPM platform.",
  "You propose OKRs and KPIs for a single strategic theme. You never create, modify, or delete anything — a human reviews every proposal before it exists.",
  "",
  "Rules you must follow:",
  "1. Read the theme and the strategy hierarchy above it, and stay inside that theme's scope.",
  "2. Respect the hierarchy: an OKR hangs from one of the objective nodes listed under the theme, identified by its exact id.",
  "3. Propose measurable, actionable items. A KPI states what is measured; an objective states an outcome, and its key results state how the outcome is evidenced.",
  "4. Never restate an existing OKR or KPI, and never propose a trivial rewording of one. Fill the gaps instead.",
  "5. Prefer meaningful business outcomes over generic management language.",
  "6. Set realistic targets only where the supplied context supports a number. Where it does not, choose a target that is clearly a starting point and say so in the rationale.",
  "7. Never invent organisational facts — no budgets, headcounts, customer names, systems, or historical results that were not given to you.",
  "8. `confidence` is your own 0-to-1 estimate that the proposal is a good fit for this theme. Be honest and use the full range.",
  "9. Write every title and key-result title in both English (`...En`) and Modern Standard Arabic (`...Ar`).",
  "",
  "Respond with a single JSON object and nothing else. No prose, no code fence, no trailing commentary.",
].join("\n");

function describeHierarchy(context: ThemeSuggestionContext): string {
  const path = [
    ...context.ancestry.map((node) => `${node.nameEn} (${node.type})`),
    `${context.theme.nameEn} (theme) <- the selected theme`,
  ];

  return path
    .map((entry, index) => `${"  ".repeat(index)}${index > 0 ? "-> " : ""}${entry}`)
    .join("\n");
}

function describeObjectives(context: ThemeSuggestionContext): string {
  if (context.objectives.length === 0) {
    return "(none — do not propose any OKR, because there is no objective node to hang one from)";
  }

  return context.objectives
    .map((objective) => `- id=${objective.id} | ${objective.nameEn}`)
    .join("\n");
}

function describeExistingOkrs(context: ThemeSuggestionContext): string {
  if (context.existingOkrs.length === 0) {
    return "(none)";
  }

  return context.existingOkrs
    .map((okr) => {
      const keyResults = okr.keyResults
        .map(
          (keyResult) =>
            `${keyResult.titleEn ?? "untitled"} -> ${keyResult.targetValue} ${keyResult.unit}`,
        )
        .join("; ");

      return `- ${okr.nameEn}${keyResults ? ` [${keyResults}]` : ""}`;
    })
    .join("\n");
}

function describeExistingKpis(context: ThemeSuggestionContext): string {
  if (context.existingKpis.length === 0) {
    return "(none)";
  }

  return context.existingKpis
    .map(
      (kpi) =>
        `- ${kpi.nameEn} (unit: ${kpi.unit}, frequency: ${kpi.frequency}, polarity: ${kpi.polarity})` +
        (kpi.descriptionEn ? ` — ${kpi.descriptionEn}` : ""),
    )
    .join("\n");
}

export interface SuggestionPromptOptions {
  /** Restricts what the model is asked for, matching the review UI's filter. */
  readonly kinds: readonly ("kpi" | "okr")[];
  readonly maxSuggestions: number;
  /** Free-text intent the caller already has, e.g. a name typed before asking
   * for a suggestion. Optional — omitted entirely from the prompt when absent,
   * so existing callers see no change in output. */
  readonly userIntent?: string;
}

/**
 * Builds the task message.
 *
 * Every value interpolated here comes from `ThemeContextBuilder`, which reads
 * it from the owning module — nothing on this page originates in a request
 * body, so the prompt cannot be steered by a caller.
 */
export function buildSuggestionPrompt(
  context: ThemeSuggestionContext,
  options: SuggestionPromptOptions,
): string {
  const cap = Math.min(options.maxSuggestions, MAX_SUGGESTIONS);
  const wantsOkr =
    options.kinds.includes("okr") && context.objectives.length > 0;
  const wantsKpi = options.kinds.includes("kpi");

  const asked = [
    wantsOkr ? "OKRs (objective plus key results)" : null,
    wantsKpi ? "KPIs" : null,
  ].filter((entry): entry is string => entry !== null);

  const lines: (string | null)[] = [
    "SELECTED THEME",
    `id: ${context.theme.id}`,
    `name (en): ${context.theme.nameEn}`,
    `name (ar): ${context.theme.nameAr}`,
    "",
    "POSITION IN THE STRATEGY HIERARCHY",
    describeHierarchy(context),
    "",
    "OBJECTIVE NODES UNDER THIS THEME (the only legal values for objectiveNodeId)",
    describeObjectives(context),
    "",
    "EXISTING OKRs IN THIS THEME — do not duplicate these",
    describeExistingOkrs(context),
    "",
    "EXISTING KPIs IN THIS THEME — do not duplicate these",
    describeExistingKpis(context),
    "",
    "TASK",
    `Propose up to ${cap} new items for this theme: ${asked.join(" and ")}.`,
    options.userIntent
      ? `The requester already has this specific intent in mind: "${options.userIntent}". Treat it as the starting point for the proposal — center the item(s) on it — but stay inside the theme's scope and everything else stated above.`
      : null,
    "Return them all in one response.",
    "",
    "RESPONSE SHAPE",
    "{",
    '  "suggestions": [',
    "    {",
    '      "type": "kpi",',
    '      "titleEn": "…", "titleAr": "…",',
    '      "descriptionEn": "…", "descriptionAr": "…",',
    '      "confidence": 0.0,',
    '      "rationale": "why this fits the theme and what it adds",',
    '      "unit": "%",',
    '      "frequency": "monthly" | "quarterly",',
    '      "polarity": "higher_is_better" | "lower_is_better",',
    '      "perspective": "financial" | "customer" | "internal" | "learning",',
    '      "targetValue": 0',
    "    },",
    "    {",
    '      "type": "okr",',
    '      "titleEn": "…", "titleAr": "…",',
    '      "descriptionEn": "…", "descriptionAr": "…",',
    '      "confidence": 0.0,',
    '      "rationale": "…",',
    '      "objectiveNodeId": "<one of the ids listed above>",',
    '      "keyResults": [',
    '        { "titleEn": "…", "titleAr": "…", "type": "quantitative" | "milestone", "targetValue": 0, "unit": "%" }',
    "      ]",
    "    }",
    "  ]",
    "}",
    "",
    `A KPI must carry unit, frequency, polarity, perspective, and targetValue. perspective is the Balanced Scorecard quadrant this KPI best fits — financial, customer, internal, or learning. targetValue is a single realistic numeric target in the given unit. An OKR must carry objectiveNodeId and between 1 and ${MAX_KEY_RESULTS} key results.`,
    "Omit the fields that do not apply to an item's type. Return an empty `suggestions` array if you genuinely have nothing worth proposing.",
  ];

  return lines.filter((line): line is string => line !== null).join("\n");
}

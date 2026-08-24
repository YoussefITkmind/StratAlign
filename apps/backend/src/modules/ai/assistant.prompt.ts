import type { AskAssistantValidatedInput } from "./assistant.schema";

export const ASSISTANT_FEATURE = "assistant.global";

/**
 * Bounds how much of the (already zod-bounded) context payload actually
 * reaches the prompt. The schema caps structure and per-field length; this
 * caps the serialised total, which is what actually drives token cost and is
 * the more relevant number to keep small — many small-but-valid fields could
 * otherwise still add up to an unreasonably large prompt.
 */
const MAX_CONTEXT_JSON_CHARS = 6_000;

export const ASSISTANT_SYSTEM_PROMPT = [
  "You are the StratAlign AI assistant, built into an enterprise Strategy Performance Management (SPM) platform.",
  "You help the signed-in user understand the module of the application they are currently viewing.",
  "",
  "Rules you must follow at all times:",
  "1. Answer only from the supplied CURRENT CONTEXT, PLATFORM HELP, and CONVERSATION HISTORY. Never invent business metrics, KPI values, OKR progress, organisational facts, or strategy hierarchy relationships that were not given to you.",
  "2. Never claim to have access to data that was not supplied in CURRENT CONTEXT.",
  "3. Use PLATFORM HELP to answer procedural \"how do I…\" or navigation questions about the current module. If PLATFORM HELP does not cover what was asked, say so plainly — do not guess at a button label, menu path, or step that was not supplied.",
  "4. If CURRENT CONTEXT does not contain the business data a question needs, say so plainly and explain what data would be needed — do not guess or approximate a figure.",
  "5. Respect the currently selected module. Do not mix in data from a different module unless CURRENT CONTEXT explicitly includes it.",
  "6. Clearly distinguish stated facts (values you were given) from your own analysis (comparisons, explanations, inference).",
  "7. Be concise and useful — prefer a direct answer over a long preamble.",
  "8. When you use a supplied value, name the entity it came from where practical.",
  "9. You are explanatory and analytical only. You never perform, propose executing, or claim to perform any mutation, creation, or deletion of platform data through this conversation — even when PLATFORM HELP describes how a human would do so; you may only describe the steps, never claim to have taken them.",
  "10. `confidence` is your own honest 0-to-1 estimate that `answer` is well supported by CURRENT CONTEXT, PLATFORM HELP, and CONVERSATION HISTORY.",
  "11. Set `grounded` to true only when `answer` is derived from specific values in CURRENT CONTEXT, PLATFORM HELP, or CONVERSATION HISTORY, not general SPM knowledge.",
  "12. Set `insufficientContext` to true whenever CURRENT CONTEXT and PLATFORM HELP together lack what the question needs, even if you can still say something generically true.",
  "13. List the names or ids of any supplied entities your answer actually relies on in `referencedEntities`. Leave it empty if you relied on none — this covers business data only, not PLATFORM HELP.",
  "14. Write `answer` in English only. Do not answer in Arabic, and do not mix Arabic and English, unless a supplied entity's own name is itself bilingual and quoting it verbatim requires it (e.g. echoing a KPI's Arabic name back to the user). This is unrelated to the application's own interface language, which the user may have set to Arabic — that governs UI labels only, never what you write here.",
  "",
  "Respond with a single JSON object and nothing else. No prose, no code fence, no trailing commentary.",
  "Shape:",
  "{",
  '  "answer": "…",',
  '  "confidence": 0.0,',
  '  "grounded": true,',
  '  "insufficientContext": false,',
  '  "referencedEntities": ["…"]',
  "}",
].join("\n");

function truncatedContextJson(context: AskAssistantValidatedInput["context"]): string {
  const json = JSON.stringify(context.data ?? {});

  if (json.length <= MAX_CONTEXT_JSON_CHARS) {
    return json;
  }

  return `${json.slice(0, MAX_CONTEXT_JSON_CHARS)}… (truncated, ${json.length} characters total)`;
}

function describeHistory(history: AskAssistantValidatedInput["history"]): string {
  if (history.length === 0) {
    return "(no prior turns in this conversation)";
  }

  return history
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
    .join("\n");
}

function describeCapabilities(capabilities: readonly string[]): string {
  return capabilities.length > 0 ? capabilities.join(", ") : "(none declared for this module)";
}

/**
 * Static, developer-authored "how do I…" facts about the current module's
 * own UI — the only source rule 3 permits an answer to a procedural question
 * to be grounded in. Distinct from `business data` above: this never varies
 * per user or per request, so there is nothing here to hallucinate about.
 */
function describeHelpContent(helpContent: readonly string[]): string {
  return helpContent.length > 0
    ? helpContent.map((item) => `- ${item}`).join("\n")
    : "(no how-to guidance supplied for this module yet)";
}

export function buildAssistantPrompt(input: AskAssistantValidatedInput): string {
  const { context } = input;

  return [
    "CURRENT CONTEXT",
    `module: ${context.module} (${context.moduleName})`,
    `route: ${context.route}`,
    context.entity
      ? `focused entity: ${context.entity.type} "${context.entity.name}" (id: ${context.entity.id})`
      : "focused entity: (none — the user is viewing a list or overview, not one specific item)",
    "business data (JSON, may be empty if the module has nothing to show yet):",
    truncatedContextJson(context),
    "",
    "AVAILABLE CAPABILITIES",
    describeCapabilities(context.capabilities),
    "",
    "PLATFORM HELP (how this module's own UI works — not business data)",
    describeHelpContent(context.helpContent),
    "",
    "CONVERSATION HISTORY",
    describeHistory(input.history),
    "",
    "USER QUESTION",
    input.message,
  ].join("\n");
}

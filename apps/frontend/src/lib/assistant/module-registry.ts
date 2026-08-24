/**
 * Maps the active route to a module identity for the global assistant.
 *
 * This is the "ContextResolver" the assistant depends on: `GlobalAssistant`
 * asks it "what module is this?" and gets back a stable id, a human name,
 * and what the assistant may help with here — never a route string it has to
 * interpret itself.
 *
 * Registering a future module (Dashboards, Reports, Data & Integrations,
 * Settings) is exactly one call to `registerAssistantModule` in this file —
 * nothing in the assistant provider, panel, or backend service needs to
 * change. Until that call exists, `resolveModule` still returns a safe,
 * honest entry for the route (`hasProvider: false`), never a fabricated one.
 */

export interface AssistantModuleDefinition {
  /** Stable id sent to the backend. Never derived from the route at request time. */
  id: string;
  name: string;
  /** Whether this route belongs to this module. First match wins. */
  matches: (pathname: string) => boolean;
  capabilities: string[];
  /**
   * Short, developer-authored "how do I…" facts about this module's own UI
   * (e.g. what a button is called, what a field requires) — never business
   * data. Lets the assistant answer procedural questions honestly instead of
   * treating every non-data question as out of scope. Empty until someone
   * has verified the copy below against the real page, same discipline as
   * `capabilities`: no entry here may describe a control that doesn't exist.
   */
  helpContent: string[];
  /** False when the module is real but has no context provider wired up yet. */
  hasProvider: boolean;
}

const registry: AssistantModuleDefinition[] = [];

/** Adds a module definition. Order matters only for overlapping prefixes (most specific first). */
export function registerAssistantModule(definition: AssistantModuleDefinition): void {
  registry.push(definition);
}

function prefixMatcher(prefix: string): (pathname: string) => boolean {
  return (pathname) => pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// --- Currently implemented modules ------------------------------------------------

registerAssistantModule({
  id: "governance_hub",
  name: "Governance Hub",
  matches: prefixMatcher("/governance/hub"),
  // The hub's calendar and escalation board are not yet backed by real data
  // (see GovernanceHubPage) — `hasProvider: false` until they are, so the
  // assistant tells the user honestly rather than implying it has data it
  // doesn't. No page needs to call `usePublishAssistantContext` for this
  // module while that stays true.
  capabilities: [],
  helpContent: [],
  hasProvider: false,
});

registerAssistantModule({
  id: "governance",
  name: "Governance",
  matches: prefixMatcher("/governance"),
  capabilities: ["explain_approval_status", "summarize_decisions"],
  helpContent: [
    'Each pending item appears as an approval card with decision buttons. "Approve" and "Continue" need no comment. "Reject" and "Request Changes" require you to type a reason first — the button stays disabled until you do.',
  ],
  hasProvider: true,
});

registerAssistantModule({
  id: "strategy_hierarchy",
  name: "Strategy Hierarchy",
  matches: prefixMatcher("/strategy-hierarchy"),
  capabilities: ["explain_hierarchy", "identify_gaps", "explain_relationships"],
  helpContent: [
    'Click "Add Node" at the top of the hierarchy view to create a new node. The same dialog opens in edit mode when you choose to edit an existing node.',
  ],
  hasProvider: true,
});

registerAssistantModule({
  id: "balanced_scorecards",
  name: "Balanced Scorecards",
  matches: prefixMatcher("/balanced-scorecards"),
  capabilities: ["explain_performance", "analyze_kpis", "explain_variance"],
  helpContent: ['Click "New Scorecard" to open the scorecard setup dialog and create one.'],
  hasProvider: true,
});

registerAssistantModule({
  id: "kpis_okrs",
  name: "KPIs & OKRs",
  matches: prefixMatcher("/kpis-okrs"),
  capabilities: ["explain_kpi", "identify_underperformance", "explain_okr_progress"],
  helpContent: [
    'In the KPI Library tab, click "Add KPI" to create a new KPI. In the OKR Library tab, use the equivalent create action to add a new objective.',
  ],
  hasProvider: true,
});

registerAssistantModule({
  id: "initiatives_projects",
  name: "Initiatives & Projects",
  matches: prefixMatcher("/initiatives-projects"),
  capabilities: ["explain_initiative_status", "identify_at_risk_initiatives"],
  helpContent: [
    'Click "Create Initiative" ("New Initiative" in the register view) to open the initiative creation form.',
  ],
  hasProvider: true,
});

// --- Routes that exist in navigation but have no module (and no fake data) yet ---
// Sidebar links to these; until each ships, the assistant must say so rather
// than guess. Adding a real provider later is the same one call as above.

for (const [id, name, prefix] of [
  ["overview", "Overview", "/overview"],
  ["strategy_maps", "Strategy Map", "/strategy-maps"],
  ["dashboards", "Dashboards", "/dashboards"],
  ["reports", "Reports", "/reports"],
  ["data_integrations", "Data & Integrations", "/data-integrations"],
  ["settings", "Settings", "/settings"],
] as const) {
  registerAssistantModule({
    id,
    name,
    matches: prefixMatcher(prefix),
    capabilities: [],
    helpContent: [],
    hasProvider: false,
  });
}

const GENERAL_MODULE: AssistantModuleDefinition = {
  id: "general",
  name: "StratAlign",
  matches: () => true,
  capabilities: [],
  helpContent: [],
  hasProvider: false,
};

/**
 * First registered match wins, so overlapping prefixes (`/governance/hub`
 * under `/governance`) must be registered most-specific first — see above.
 * Falls back to a generic, honest entry for anything nothing else claims.
 */
export function resolveModule(pathname: string): AssistantModuleDefinition {
  return registry.find((definition) => definition.matches(pathname)) ?? GENERAL_MODULE;
}

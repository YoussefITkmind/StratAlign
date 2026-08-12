import type { DiffRendererProps } from "./types";
import GenericJsonDiff from "./GenericJsonDiff";
import ScorecardWeightingDiff from "./ScorecardWeightingDiff";
import StrategyMapDiff from "./StrategyMapDiff";

/**
 * Extensible before/after/impact rendering keyed by ApprovalCase entityType
 * (the real, backend-assigned strings — see WEIGHTING_ENTITY / MAP_ENTITY in
 * scorecard.service.ts, subjectType in kpi-registry.service.ts, and
 * RuleBuilderPanel's governance.submit call for "RuleDefinition"). Any entity
 * type without a dedicated case below falls back to a generic flat JSON diff
 * so no case type is ever left unrenderable. Renders directly via a switch
 * rather than a component-keyed lookup table, so JSX never holds a component
 * reference computed during render.
 */
export function renderDiffFor(entityType: string, props: DiffRendererProps) {
  switch (entityType) {
    case "scorecard_weighting":
      return <ScorecardWeightingDiff {...props} />;
    case "strategy_map":
      return <StrategyMapDiff {...props} />;
    default:
      return <GenericJsonDiff {...props} />;
  }
}

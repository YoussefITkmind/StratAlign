import type { DiffRendererProps } from "./types";
import GenericJsonDiff from "./GenericJsonDiff";
import ScorecardWeightingDiff from "./ScorecardWeightingDiff";
import StrategyMapDiff from "./StrategyMapDiff";
import ValueGateDiff from "./ValueGateDiff";

/** Extensible before/after/impact rendering keyed by ApprovalCase entityType. */
export function renderDiffFor(entityType: string, props: DiffRendererProps) {
  switch (entityType) {
    case "scorecard_weighting":
      return <ScorecardWeightingDiff {...props} />;
    case "strategy_map":
      return <StrategyMapDiff {...props} />;
    case "value_gate_review":
      return <ValueGateDiff {...props} />;
    default:
      return <GenericJsonDiff {...props} />;
  }
}

import type { RollupRule, ThresholdStatusRule } from "../../src";

/**
 * Golden rule fixtures.
 *
 * These are the canonical rule documents the rule-engine unit tests assert
 * against. They are extracted here rather than declared inline so downstream
 * modules can evaluate against *the same* documents instead of restating them —
 * a restated fixture that drifts would prove nothing about the engine those
 * modules actually call.
 */

/**
 * Higher-is-better threshold bands: on_track at 80+, watch at 50+, off_track
 * below 50. `off_track` is the label the performance module's breach detection
 * watches for.
 */
export const goldenThresholdStatusRule: ThresholdStatusRule = {
  ruleType: "threshold_status",
  direction: "higher_is_better",
  bands: [
    {
      label: "on_track",
      color: "green",
      comparator: "gte",
      value: 80,
    },
    {
      label: "watch",
      color: "amber",
      comparator: "gte",
      value: 50,
    },
    {
      label: "off_track",
      color: "red",
      comparator: "lt",
      value: 50,
    },
  ],
};

export const goldenSumRollupRule: RollupRule = {
  ruleType: "rollup",
  method: "sum",
};

export const goldenAverageRollupRule: RollupRule = {
  ruleType: "rollup",
  method: "average",
};

/** The child set the rollup unit tests aggregate: sum 60, average 20. */
export const goldenRollupChildren = [
  { id: "a", value: 10 },
  { id: "b", value: 20 },
  { id: "c", value: 30 },
] as const;

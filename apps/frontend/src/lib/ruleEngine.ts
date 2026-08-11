import { Direction, KpiStatus, RuleComparator, RuleDefinition, ThresholdBand } from "@/types/kpi";

let counter = 0;
function bandId(): string {
  counter += 1;
  return `band-${Date.now()}-${counter}`;
}

export function buildDefaultRule(kpiId: string, target: number, direction: Direction): RuleDefinition {
  const spread = Math.abs(target) * 0.1 || 1;
  const goodCmp: RuleComparator = direction === "higher-better" ? ">=" : "<=";
  const warnCmp: RuleComparator = direction === "higher-better" ? ">=" : "<=";
  const warnValue = direction === "higher-better" ? target - spread : target + spread;

  return {
    id: `rule-${kpiId}`,
    kpiId,
    direction,
    active: true,
    version: 1,
    bands: [
      { id: bandId(), label: "On Track", comparator: goodCmp, value: target, status: "on-track" },
      { id: bandId(), label: "At Risk", comparator: warnCmp, value: warnValue, status: "at-risk" },
      { id: bandId(), label: "Behind", comparator: direction === "higher-better" ? "<" : ">", value: warnValue, status: "behind" },
    ],
  };
}

function compare(value: number, comparator: RuleComparator, threshold: number): boolean {
  switch (comparator) {
    case ">=": return value >= threshold;
    case ">": return value > threshold;
    case "<=": return value <= threshold;
    case "<": return value < threshold;
  }
}

export function evaluateStatus(value: number, rule: Pick<RuleDefinition, "bands">): KpiStatus {
  for (const band of rule.bands) {
    if (compare(value, band.comparator, band.value)) return band.status;
  }
  return rule.bands[rule.bands.length - 1]?.status ?? "at-risk";
}

export function validateBands(bands: ThresholdBand[], direction: Direction): { valid: boolean; error?: string } {
  if (bands.length < 2) {
    return { valid: false, error: "At least two bands are required." };
  }
  const boundaries = bands
    .filter((b) => b.comparator === ">=" || b.comparator === ">" || b.comparator === "<=" || b.comparator === "<")
    .map((b) => b.value);

  for (let i = 0; i < boundaries.length - 1; i++) {
    const isDescending = direction === "higher-better";
    if (isDescending && boundaries[i] < boundaries[i + 1]) {
      return { valid: false, error: "Band thresholds must be in descending order for a higher-is-better KPI." };
    }
    if (!isDescending && boundaries[i] > boundaries[i + 1]) {
      return { valid: false, error: "Band thresholds must be in ascending order for a lower-is-better KPI." };
    }
    if (boundaries[i] === boundaries[i + 1]) {
      return { valid: false, error: "Band thresholds must not overlap." };
    }
  }
  return { valid: true };
}

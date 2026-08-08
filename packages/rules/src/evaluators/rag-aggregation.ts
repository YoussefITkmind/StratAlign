import type {
  RagAggregationInput,
  RagAggregationResult,
  RagAggregationRule,
  RagStatus,
} from "../schemas/rag-aggregation";

const ragScore: Record<RagStatus, number> = {
  on_track: 0,
  watch: 0.5,
  off_track: 1,
};

export function evaluateRagAggregation(
  rule: RagAggregationRule,
  input: RagAggregationInput,
): RagAggregationResult {
  if (rule.method === "worst_child_wins") {
    const score = Math.max(
      ...input.children.map((child) => ragScore[child.status]),
    );

    return {
      status:
        score === 1
          ? "off_track"
          : score === 0.5
            ? "watch"
            : "on_track",
      score,
    };
  }

  const weightedChildren = input.children.map((child) => ({
    score: ragScore[child.status],
    weight: child.weight ?? 1,
  }));

  const totalWeight = weightedChildren.reduce(
    (total, child) => total + child.weight,
    0,
  );

  const score =
    weightedChildren.reduce(
      (total, child) => total + child.score * child.weight,
      0,
    ) / totalWeight;

  return {
    status:
      score >= rule.offTrackThreshold
        ? "off_track"
        : score >= rule.watchThreshold
          ? "watch"
          : "on_track",
    score,
  };
}

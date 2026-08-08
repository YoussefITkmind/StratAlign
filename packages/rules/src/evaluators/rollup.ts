import type {
  RollupInput,
  RollupResult,
  RollupRule,
} from "../schemas/rollup";

export function evaluateRollup(
  rule: RollupRule,
  input: RollupInput,
): RollupResult {
  const included = input.children.filter(
    (child): child is { id: string; value: number } =>
      child.value !== null,
  );

  const excludedChildIds = input.children
    .filter((child) => child.value === null)
    .map((child) => child.id);

  const includedChildIds = included.map((child) => child.id);

  if (included.length === 0) {
    return {
      value: null,
      includedChildIds,
      excludedChildIds,
    };
  }

  switch (rule.method) {
    case "sum":
      return {
        value: included.reduce(
          (total, child) => total + child.value,
          0,
        ),
        includedChildIds,
        excludedChildIds,
      };

    case "average":
      return {
        value:
          included.reduce(
            (total, child) => total + child.value,
            0,
          ) / included.length,
        includedChildIds,
        excludedChildIds,
      };

    case "weighted_average": {
      const weightedChildren = included.map((child) => {
        const weight = rule.weights[child.id];

        if (weight === undefined) {
          throw new Error(
            `Missing weight for child: ${child.id}`,
          );
        }

        return {
          ...child,
          weight,
        };
      });

      const totalWeight = weightedChildren.reduce(
        (total, child) => total + child.weight,
        0,
      );

      if (totalWeight <= 0) {
        throw new Error(
          "Weighted average requires a positive total weight",
        );
      }

      const weightedTotal = weightedChildren.reduce(
        (total, child) =>
          total + child.value * child.weight,
        0,
      );

      return {
        value: weightedTotal / totalWeight,
        includedChildIds,
        excludedChildIds,
      };
    }

    case "worst_of":
      return {
        value:
          rule.direction === "higher_is_better"
            ? Math.min(...included.map((child) => child.value))
            : Math.max(...included.map((child) => child.value)),
        includedChildIds,
        excludedChildIds,
      };
  }
}

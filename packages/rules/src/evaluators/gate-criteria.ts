import type {
  GateCriteriaInput,
  GateCriteriaResult,
  GateCriteriaRule,
  GateCriterion,
  GateFactValue,
} from "../schemas/gate-criteria";

function valuesEqual(
  actual: GateFactValue | undefined,
  expected: GateFactValue,
): boolean {
  return actual === expected;
}

function evaluateCriterion(
  criterion: GateCriterion,
  facts: GateCriteriaInput["facts"],
): boolean {
  const hasFact = Object.prototype.hasOwnProperty.call(
    facts,
    criterion.fact,
  );

  const actual = facts[criterion.fact];

  switch (criterion.operator) {
    case "equals":
      return hasFact && valuesEqual(actual, criterion.expected);

    case "not_equals":
      return !hasFact || !valuesEqual(actual, criterion.expected);

    case "gt":
      return typeof actual === "number" &&
        actual > criterion.expected;

    case "gte":
      return typeof actual === "number" &&
        actual >= criterion.expected;

    case "lt":
      return typeof actual === "number" &&
        actual < criterion.expected;

    case "lte":
      return typeof actual === "number" &&
        actual <= criterion.expected;

    case "in":
      return hasFact &&
        criterion.expected.some((value) =>
          valuesEqual(actual, value),
        );

    case "exists":
      return criterion.expected ? hasFact : !hasFact;
  }
}

export function evaluateGateCriteria(
  rule: GateCriteriaRule,
  input: GateCriteriaInput,
): GateCriteriaResult {
  const criteria = rule.criteria.map((criterion) => {
    const hasFact = Object.prototype.hasOwnProperty.call(
      input.facts,
      criterion.fact,
    );

    return {
      name: criterion.name,
      fact: criterion.fact,
      passed: evaluateCriterion(criterion, input.facts),
      ...(hasFact
        ? { actual: input.facts[criterion.fact] }
        : {}),
      expected: criterion.expected,
    };
  });

  return {
    passed: criteria.every((criterion) => criterion.passed),
    criteria,
  };
}

export const STRATEGY_NODE_TYPES = [
  "corporate_strategy",
  "theme",
  "objective",
  "strategic_play",
  "portfolio",
  "area_of_focus",
] as const;
export type StrategyNodeType = (typeof STRATEGY_NODE_TYPES)[number];

export const STRATEGY_NODE_STATES = ["draft", "active", "retired"] as const;
export type StrategyNodeState = (typeof STRATEGY_NODE_STATES)[number];

export const STRATEGY_EDGE_TYPES = [
  "contains",
  "executed_by",
  "belongs_to_portfolio",
  "aligns_to",
] as const;
export type StrategyEdgeType = (typeof STRATEGY_EDGE_TYPES)[number];

export const PLAN_VERSION_STATES = ["draft", "active", "closed"] as const;
export type PlanVersionState = (typeof PLAN_VERSION_STATES)[number];

export interface PlanVersion {
  id: string;
  name: string;
  status: PlanVersionState;
  opensAt: Date | null;
  closesAt: Date | null;
  sourcePlanVersionId: string | null;
}

export interface StrategyNode {
  id: string;
  type: StrategyNodeType;
  nameEn: string;
  nameAr: string;
  planVersionId: string;
  state: StrategyNodeState;
  createdBy: string;
  createdAt: Date;
}

export interface StrategyEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: StrategyEdgeType;
  planVersionId: string;
}

export interface RelationshipRule {
  id?: string;
  fromType: StrategyNodeType;
  toType: StrategyNodeType;
  edgeType: StrategyEdgeType;
  minCount: number;
  maxCount: number | null;
}

export interface OwnerAssignment {
  id: string;
  nodeId: string;
  ownerUserId: string;
  assignedBy: string;
  assignedAt: Date;
}

function enumParser<T extends readonly string[]>(values: T) {
  return {
    parse(value: unknown): T[number] {
      if (typeof value !== "string" || !values.includes(value)) {
        throw new Error(`Expected one of: ${values.join(", ")}`);
      }
      return value as T[number];
    },
  };
}

export const strategyNodeTypeSchema = enumParser(STRATEGY_NODE_TYPES);
export const strategyNodeStateSchema = enumParser(STRATEGY_NODE_STATES);
export const strategyEdgeTypeSchema = enumParser(STRATEGY_EDGE_TYPES);
export const planVersionStateSchema = enumParser(PLAN_VERSION_STATES);

/**
 * Authoritative TSD-03 relationship set.
 * objective -> strategic_play is represented only by executed_by. We do not
 * duplicate the same pair with aligns_to. Area of Focus alignment belongs to
 * Strategic Play, which keeps the graph unambiguous for cardinality checks.
 */
export const DEFAULT_RELATIONSHIP_RULES: readonly RelationshipRule[] = [
  { fromType: "corporate_strategy", toType: "theme", edgeType: "contains", minCount: 1, maxCount: null },
  { fromType: "theme", toType: "objective", edgeType: "contains", minCount: 1, maxCount: null },
  { fromType: "objective", toType: "strategic_play", edgeType: "executed_by", minCount: 1, maxCount: null },
  { fromType: "strategic_play", toType: "portfolio", edgeType: "belongs_to_portfolio", minCount: 0, maxCount: 1 },
  { fromType: "strategic_play", toType: "area_of_focus", edgeType: "aligns_to", minCount: 0, maxCount: null },
] as const;

export class InvalidStrategyRelationshipError extends Error {
  readonly code = "INVALID_STRATEGY_RELATIONSHIP";
  constructor(
    readonly fromType: StrategyNodeType,
    readonly toType: StrategyNodeType,
    readonly edgeType: StrategyEdgeType,
  ) {
    super(`Invalid strategy relationship: ${fromType} -[${edgeType}]-> ${toType}`);
    this.name = "InvalidStrategyRelationshipError";
  }
}

export class CrossPlanVersionRelationshipError extends Error {
  readonly code = "CROSS_PLAN_VERSION_RELATIONSHIP";
  constructor() {
    super("Strategy edges cannot connect nodes from different plan versions.");
    this.name = "CrossPlanVersionRelationshipError";
  }
}

export class StrategyCycleError extends Error {
  readonly code = "STRATEGY_GRAPH_CYCLE";
  constructor() {
    super("Strategy relationships must not introduce a directed cycle.");
    this.name = "StrategyCycleError";
  }
}

export class RelationshipCardinalityError extends Error {
  readonly code = "RELATIONSHIP_CARDINALITY_VIOLATION";
  constructor(readonly rule: RelationshipRule, readonly count: number) {
    super(`Relationship cardinality violated for ${rule.fromType} -[${rule.edgeType}]-> ${rule.toType}: ${count}`);
    this.name = "RelationshipCardinalityError";
  }
}

export function findRelationshipRule(
  fromType: StrategyNodeType,
  toType: StrategyNodeType,
  edgeType: StrategyEdgeType,
  rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES,
): RelationshipRule | undefined {
  return rules.find(
    (rule) => rule.fromType === fromType && rule.toType === toType && rule.edgeType === edgeType,
  );
}

export function isRelationshipAllowed(
  fromType: StrategyNodeType,
  toType: StrategyNodeType,
  edgeType: StrategyEdgeType,
  rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES,
): boolean {
  return findRelationshipRule(fromType, toType, edgeType, rules) !== undefined;
}

export function assertRelationshipAllowed(
  fromType: StrategyNodeType,
  toType: StrategyNodeType,
  edgeType: StrategyEdgeType,
  rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES,
): RelationshipRule {
  const rule = findRelationshipRule(fromType, toType, edgeType, rules);
  if (!rule) throw new InvalidStrategyRelationshipError(fromType, toType, edgeType);
  return rule;
}

export function validateEdge(
  fromNode: Pick<StrategyNode, "type" | "planVersionId">,
  toNode: Pick<StrategyNode, "type" | "planVersionId">,
  edgeType: StrategyEdgeType,
  rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES,
): RelationshipRule {
  if (fromNode.planVersionId !== toNode.planVersionId) {
    throw new CrossPlanVersionRelationshipError();
  }
  return assertRelationshipAllowed(fromNode.type, toNode.type, edgeType, rules);
}

export function assertRelationshipCardinality(rule: RelationshipRule, count: number): void {
  if (count < rule.minCount || (rule.maxCount !== null && count > rule.maxCount)) {
    throw new RelationshipCardinalityError(rule, count);
  }
}

export type DirectedEdge = Pick<StrategyEdge, "fromNodeId" | "toNodeId">;

export function hasDirectedCycle(edges: readonly DirectedEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const current of edges) {
    nodes.add(current.fromNodeId);
    nodes.add(current.toNodeId);
    const targets = adjacency.get(current.fromNodeId) ?? [];
    targets.push(current.toNodeId);
    adjacency.set(current.fromNodeId, targets);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (current: string): boolean => {
    if (visiting.has(current)) return true;
    if (visited.has(current)) return false;
    visiting.add(current);
    for (const target of adjacency.get(current) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(current);
    visited.add(current);
    return false;
  };

  return [...nodes].some(visit);
}

export function assertAcyclic(edges: readonly DirectedEdge[]): void {
  if (hasDirectedCycle(edges)) throw new StrategyCycleError();
}

export function validateGraph(
  nodes: readonly Pick<StrategyNode, "id" | "type" | "planVersionId">[],
  edges: readonly Pick<StrategyEdge, "fromNodeId" | "toNodeId" | "edgeType" | "planVersionId">[],
  rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES,
): void {
  const nodeById = new Map(nodes.map((value) => [value.id, value]));
  for (const current of edges) {
    const from = nodeById.get(current.fromNodeId);
    const to = nodeById.get(current.toNodeId);
    if (!from || !to || from.planVersionId !== current.planVersionId || to.planVersionId !== current.planVersionId) {
      throw new CrossPlanVersionRelationshipError();
    }
    validateEdge(from, to, current.edgeType, rules);
  }
  assertAcyclic(edges);

  for (const currentNode of nodes) {
    for (const currentRule of rules.filter((candidate) => candidate.fromType === currentNode.type)) {
      const count = edges.filter((current) => {
        if (current.fromNodeId !== currentNode.id || current.edgeType !== currentRule.edgeType) return false;
        return nodeById.get(current.toNodeId)?.type === currentRule.toType;
      }).length;
      assertRelationshipCardinality(currentRule, count);
    }
  }
}

export function canTransitionNodeState(from: StrategyNodeState, to: StrategyNodeState): boolean {
  if (from === to) return true;
  return (from === "draft" && (to === "active" || to === "retired")) ||
    (from === "active" && to === "retired");
}

export function assertNodeStateTransition(from: StrategyNodeState, to: StrategyNodeState): void {
  if (!canTransitionNodeState(from, to)) {
    throw new Error(`Invalid strategy node state transition: ${from} -> ${to}`);
  }
}

export function canTransitionPlanVersionState(from: PlanVersionState, to: PlanVersionState): boolean {
  if (from === to) return true;
  return (from === "draft" && to === "active") || (from === "active" && to === "closed");
}

export function assertPlanVersionStateTransition(from: PlanVersionState, to: PlanVersionState): void {
  if (!canTransitionPlanVersionState(from, to)) {
    throw new Error(`Invalid plan version state transition: ${from} -> ${to}`);
  }
}

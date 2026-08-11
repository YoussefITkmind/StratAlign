import { z } from "zod";

export const STRATEGY_NODE_TYPES = [
  "corporate_strategy",
  "theme",
  "objective",
  "strategic_play",
  "portfolio",
  "area_of_focus",
] as const;
export const strategyNodeTypeSchema = z.enum(STRATEGY_NODE_TYPES);
export type StrategyNodeType = z.infer<typeof strategyNodeTypeSchema>;

export const STRATEGY_NODE_STATES = ["draft", "active", "retired"] as const;
export const strategyNodeStateSchema = z.enum(STRATEGY_NODE_STATES);
export type StrategyNodeState = z.infer<typeof strategyNodeStateSchema>;

export const STRATEGY_EDGE_TYPES = [
  "contains",
  "executed_by",
  "belongs_to_portfolio",
  "aligns_to",
] as const;
export const strategyEdgeTypeSchema = z.enum(STRATEGY_EDGE_TYPES);
export type StrategyEdgeType = z.infer<typeof strategyEdgeTypeSchema>;

export const PLAN_VERSION_STATES = ["draft", "active", "retired"] as const;
export const planVersionStateSchema = z.enum(PLAN_VERSION_STATES);
export type PlanVersionState = z.infer<typeof planVersionStateSchema>;

const nonEmptyName = z.string().trim().min(1).max(300);
const uuid = z.string().uuid();

export const planVersionSchema = z.object({
  id: uuid,
  version: z.number().int().positive(),
  name: nonEmptyName,
  state: planVersionStateSchema,
  effectiveFrom: z.date().nullable(),
  effectiveTo: z.date().nullable(),
  sourcePlanVersionId: uuid.nullable().default(null),
  createdBy: uuid,
  createdAt: z.date(),
}).strict();
export type PlanVersion = z.infer<typeof planVersionSchema>;

export const strategyNodeSchema = z.object({
  id: uuid,
  type: strategyNodeTypeSchema,
  nameEn: nonEmptyName,
  nameAr: nonEmptyName,
  planVersionId: uuid,
  state: strategyNodeStateSchema,
  createdBy: uuid,
  createdAt: z.date(),
}).strict();
export type StrategyNode = z.infer<typeof strategyNodeSchema>;

export const strategyEdgeSchema = z.object({
  id: uuid,
  fromNodeId: uuid,
  toNodeId: uuid,
  edgeType: strategyEdgeTypeSchema,
  planVersionId: uuid,
}).strict();
export type StrategyEdge = z.infer<typeof strategyEdgeSchema>;

export const relationshipRuleSchema = z.object({
  id: uuid.optional(),
  fromType: strategyNodeTypeSchema,
  toType: strategyNodeTypeSchema,
  edgeType: strategyEdgeTypeSchema,
  minCount: z.number().int().min(0).default(0),
  maxCount: z.number().int().positive().nullable().default(null),
}).strict().refine(
  (rule) => rule.maxCount === null || rule.maxCount >= rule.minCount,
  { message: "maxCount must be greater than or equal to minCount" },
);
export type RelationshipRule = z.infer<typeof relationshipRuleSchema>;

export const ownerAssignmentSchema = z.object({
  id: uuid,
  nodeId: uuid,
  userId: uuid,
  planVersionId: uuid,
  createdBy: uuid,
  createdAt: z.date(),
}).strict();
export type OwnerAssignment = z.infer<typeof ownerAssignmentSchema>;

export const DEFAULT_RELATIONSHIP_RULES: readonly RelationshipRule[] = [
  { fromType: "corporate_strategy", toType: "theme", edgeType: "contains", minCount: 1, maxCount: null },
  { fromType: "theme", toType: "objective", edgeType: "contains", minCount: 1, maxCount: null },
  { fromType: "objective", toType: "strategic_play", edgeType: "executed_by", minCount: 0, maxCount: null },
  { fromType: "strategic_play", toType: "portfolio", edgeType: "belongs_to_portfolio", minCount: 0, maxCount: 1 },
  { fromType: "strategic_play", toType: "area_of_focus", edgeType: "aligns_to", minCount: 0, maxCount: null },
  { fromType: "objective", toType: "area_of_focus", edgeType: "aligns_to", minCount: 0, maxCount: null },
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
  for (const edge of edges) {
    nodes.add(edge.fromNodeId);
    nodes.add(edge.toNodeId);
    const targets = adjacency.get(edge.fromNodeId) ?? [];
    targets.push(edge.toNodeId);
    adjacency.set(edge.fromNodeId, targets);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const target of adjacency.get(node) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  return [...nodes].some((node) => visit(node));
}

export function assertAcyclic(edges: readonly DirectedEdge[]): void {
  if (hasDirectedCycle(edges)) throw new StrategyCycleError();
}

export function validateGraph(
  nodes: readonly Pick<StrategyNode, "id" | "type" | "planVersionId">[],
  edges: readonly Pick<StrategyEdge, "fromNodeId" | "toNodeId" | "edgeType" | "planVersionId">[],
  rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES,
): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    const from = nodeById.get(edge.fromNodeId);
    const to = nodeById.get(edge.toNodeId);
    if (!from || !to || from.planVersionId !== edge.planVersionId || to.planVersionId !== edge.planVersionId) {
      throw new CrossPlanVersionRelationshipError();
    }
    validateEdge(from, to, edge.edgeType, rules);
  }
  assertAcyclic(edges);

  for (const node of nodes) {
    for (const rule of rules.filter((candidate) => candidate.fromType === node.type)) {
      const count = edges.filter((edge) => {
        if (edge.fromNodeId !== node.id || edge.edgeType !== rule.edgeType) return false;
        const target = nodeById.get(edge.toNodeId);
        return target?.type === rule.toType;
      }).length;
      assertRelationshipCardinality(rule, count);
    }
  }
}

export function canTransitionNodeState(from: StrategyNodeState, to: StrategyNodeState): boolean {
  if (from === to) return true;
  return (from === "draft" && (to === "active" || to === "retired")) || (from === "active" && to === "retired");
}

export function assertNodeStateTransition(from: StrategyNodeState, to: StrategyNodeState): void {
  if (!canTransitionNodeState(from, to)) {
    throw new Error(`Invalid strategy node state transition: ${from} -> ${to}`);
  }
}

export function canTransitionPlanVersionState(from: PlanVersionState, to: PlanVersionState): boolean {
  if (from === to) return true;
  return (from === "draft" && (to === "active" || to === "retired")) || (from === "active" && to === "retired");
}

export function assertPlanVersionStateTransition(from: PlanVersionState, to: PlanVersionState): void {
  if (!canTransitionPlanVersionState(from, to)) {
    throw new Error(`Invalid plan version state transition: ${from} -> ${to}`);
  }
}

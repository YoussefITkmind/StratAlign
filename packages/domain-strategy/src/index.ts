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

export const STRATEGY_EDGE_TYPES = ["contains", "executed_by", "belongs_to_portfolio", "aligns_to"] as const;
export const strategyEdgeTypeSchema = z.enum(STRATEGY_EDGE_TYPES);
export type StrategyEdgeType = z.infer<typeof strategyEdgeTypeSchema>;

export const PLAN_VERSION_STATUSES = ["draft", "active", "closed"] as const;
export const planVersionStatusSchema = z.enum(PLAN_VERSION_STATUSES);
export type PlanVersionStatus = z.infer<typeof planVersionStatusSchema>;

export const STAGED_CHANGE_KINDS = ["node_create", "node_update", "node_retire", "edge_link", "edge_unlink"] as const;
export const stagedChangeKindSchema = z.enum(STAGED_CHANGE_KINDS);
export type StagedChangeKind = z.infer<typeof stagedChangeKindSchema>;
export const STAGED_CHANGE_STATUSES = ["pending", "applied", "cancelled"] as const;
export const stagedChangeStatusSchema = z.enum(STAGED_CHANGE_STATUSES);
export type StagedChangeStatus = z.infer<typeof stagedChangeStatusSchema>;

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(300);

export const planVersionSchema = z.object({
  id: uuid,
  name,
  status: planVersionStatusSchema,
  opensAt: z.date().nullable(),
  closesAt: z.date().nullable(),
  sourcePlanVersionId: uuid.nullable().optional(),
}).strict();
export type PlanVersion = z.infer<typeof planVersionSchema>;

export const strategyNodeSchema = z.object({
  id: uuid,
  type: strategyNodeTypeSchema,
  nameEn: name,
  nameAr: name,
  planVersionId: uuid,
  state: strategyNodeStateSchema,
  createdBy: z.string().min(1),
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
  minCount: z.number().int().min(0),
  maxCount: z.number().int().positive().nullable(),
}).strict().refine((rule) => rule.maxCount === null || rule.maxCount >= rule.minCount, {
  message: "maxCount must be null or greater than or equal to minCount",
});
export type RelationshipRule = z.infer<typeof relationshipRuleSchema>;

export const ownerAssignmentSchema = z.object({
  id: uuid,
  nodeId: uuid,
  ownerUserId: z.string().min(1),
  assignedBy: z.string().min(1),
  assignedAt: z.date(),
}).strict();
export type OwnerAssignment = z.infer<typeof ownerAssignmentSchema>;

export const stagedChangeSchema = z.object({
  id: uuid,
  approvalCaseId: uuid,
  planVersionId: uuid,
  kind: stagedChangeKindSchema,
  targetId: uuid.nullable(),
  payload: z.record(z.string(), z.unknown()),
  status: stagedChangeStatusSchema,
  requestedBy: z.string().min(1),
  requestedAt: z.date(),
  appliedAt: z.date().nullable(),
}).strict();
export type StagedChange = z.infer<typeof stagedChangeSchema>;

/**
 * Authoritative Prompt 2.1 relationship rules.
 *
 * The prompt mentions objective -> strategic_play both as `executed_by` and as
 * an overlapping alignment. We resolve that duplication by keeping one semantic
 * edge: objective -[executed_by]-> strategic_play. `aligns_to` is reserved for
 * strategic_play -> area_of_focus. This avoids two edge types describing the
 * same relationship and keeps cardinality deterministic.
 *
 * minCount is checked when a plan is opened/validated; maxCount is enforced on
 * every edge insertion.
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
  constructor(readonly fromType: StrategyNodeType, readonly toType: StrategyNodeType, readonly edgeType: StrategyEdgeType) {
    super(`Invalid strategy relationship: ${fromType} -[${edgeType}]-> ${toType}`);
    this.name = "InvalidStrategyRelationshipError";
  }
}
export class CrossPlanVersionRelationshipError extends Error {
  readonly code = "CROSS_PLAN_VERSION_RELATIONSHIP";
  constructor() { super("Strategy edges cannot connect nodes from different plan versions."); this.name = "CrossPlanVersionRelationshipError"; }
}
export class StrategyCycleError extends Error {
  readonly code = "STRATEGY_GRAPH_CYCLE";
  constructor() { super("Strategy relationships must not introduce a directed cycle."); this.name = "StrategyCycleError"; }
}
export class RelationshipCardinalityError extends Error {
  readonly code = "RELATIONSHIP_CARDINALITY_VIOLATION";
  constructor(readonly rule: RelationshipRule, readonly count: number) {
    super(`Relationship cardinality violated for ${rule.fromType} -[${rule.edgeType}]-> ${rule.toType}: ${count}`);
    this.name = "RelationshipCardinalityError";
  }
}

export function findRelationshipRule(fromType: StrategyNodeType, toType: StrategyNodeType, edgeType: StrategyEdgeType, rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES): RelationshipRule | undefined {
  return rules.find((rule) => rule.fromType === fromType && rule.toType === toType && rule.edgeType === edgeType);
}
export function assertRelationshipAllowed(fromType: StrategyNodeType, toType: StrategyNodeType, edgeType: StrategyEdgeType, rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES): RelationshipRule {
  const rule = findRelationshipRule(fromType, toType, edgeType, rules);
  if (!rule) throw new InvalidStrategyRelationshipError(fromType, toType, edgeType);
  return rule;
}
export function validateEdge(fromNode: Pick<StrategyNode, "type" | "planVersionId">, toNode: Pick<StrategyNode, "type" | "planVersionId">, edgeType: StrategyEdgeType, currentCount = 0, rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES): void {
  if (fromNode.planVersionId !== toNode.planVersionId) throw new CrossPlanVersionRelationshipError();
  const rule = assertRelationshipAllowed(fromNode.type, toNode.type, edgeType, rules);
  if (rule.maxCount !== null && currentCount >= rule.maxCount) throw new RelationshipCardinalityError(rule, currentCount + 1);
}

export type DirectedEdge = Readonly<{ fromNodeId: string; toNodeId: string }>;
export function wouldCreateCycle(fromNodeId: string, toNodeId: string, edges: readonly DirectedEdge[]): boolean {
  if (fromNodeId === toNodeId) return true;
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fromNodeId) ?? [];
    list.push(edge.toNodeId);
    adjacency.set(edge.fromNodeId, list);
  }
  const seen = new Set<string>();
  const stack = [toNodeId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === fromNodeId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

export function assertMinimumCardinality(nodes: readonly Pick<StrategyNode, "id" | "type">[], edges: readonly Pick<StrategyEdge, "fromNodeId" | "toNodeId" | "edgeType">[], rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const source of nodes) {
    for (const rule of rules.filter((candidate) => candidate.fromType === source.type && candidate.minCount > 0)) {
      const count = edges.filter((edge) => edge.fromNodeId === source.id && edge.edgeType === rule.edgeType && byId.get(edge.toNodeId)?.type === rule.toType).length;
      if (count < rule.minCount) throw new RelationshipCardinalityError(rule, count);
    }
  }
}

export function canTransitionNodeState(from: StrategyNodeState, to: StrategyNodeState): boolean {
  if (from === to) return true;
  return (from === "draft" && (to === "active" || to === "retired")) || (from === "active" && to === "retired");
}
export function canTransitionPlanVersionStatus(from: PlanVersionStatus, to: PlanVersionStatus): boolean {
  if (from === to) return true;
  return (from === "draft" && to === "active") || (from === "active" && to === "closed");
}

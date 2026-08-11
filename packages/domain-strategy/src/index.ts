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
  fromType: strategyNodeTypeSchema,
  toType: strategyNodeTypeSchema,
  edgeType: strategyEdgeTypeSchema,
}).strict();
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
  { fromType: "corporate_strategy", toType: "theme", edgeType: "contains" },
  { fromType: "theme", toType: "objective", edgeType: "contains" },
  { fromType: "objective", toType: "strategic_play", edgeType: "executed_by" },
  { fromType: "strategic_play", toType: "portfolio", edgeType: "belongs_to_portfolio" },
  { fromType: "strategic_play", toType: "area_of_focus", edgeType: "aligns_to" },
  { fromType: "objective", toType: "area_of_focus", edgeType: "aligns_to" },
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

export function isRelationshipAllowed(
  fromType: StrategyNodeType,
  toType: StrategyNodeType,
  edgeType: StrategyEdgeType,
  rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES,
): boolean {
  return rules.some(
    (rule) =>
      rule.fromType === fromType &&
      rule.toType === toType &&
      rule.edgeType === edgeType,
  );
}

export function assertRelationshipAllowed(
  fromType: StrategyNodeType,
  toType: StrategyNodeType,
  edgeType: StrategyEdgeType,
  rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES,
): void {
  if (!isRelationshipAllowed(fromType, toType, edgeType, rules)) {
    throw new InvalidStrategyRelationshipError(fromType, toType, edgeType);
  }
}

export function validateEdge(
  fromNode: Pick<StrategyNode, "type" | "planVersionId">,
  toNode: Pick<StrategyNode, "type" | "planVersionId">,
  edgeType: StrategyEdgeType,
  rules: readonly RelationshipRule[] = DEFAULT_RELATIONSHIP_RULES,
): void {
  if (fromNode.planVersionId !== toNode.planVersionId) {
    throw new CrossPlanVersionRelationshipError();
  }
  assertRelationshipAllowed(fromNode.type, toNode.type, edgeType, rules);
}

export function canTransitionNodeState(
  from: StrategyNodeState,
  to: StrategyNodeState,
): boolean {
  if (from === to) return true;
  return (
    (from === "draft" && (to === "active" || to === "retired")) ||
    (from === "active" && to === "retired")
  );
}

export function assertNodeStateTransition(
  from: StrategyNodeState,
  to: StrategyNodeState,
): void {
  if (!canTransitionNodeState(from, to)) {
    throw new Error(`Invalid strategy node state transition: ${from} -> ${to}`);
  }
}

import { randomUUID } from "node:crypto";
import type { PrismaService } from "../../database/prisma.service";

export type StrategyNodeType =
  | "corporate_strategy"
  | "theme"
  | "objective"
  | "strategic_play"
  | "portfolio"
  | "area_of_focus";
export type StrategyNodeState = "draft" | "active" | "retired";
export type StrategyEdgeType = "contains" | "executed_by" | "belongs_to_portfolio" | "aligns_to";
export type PlanVersionState = "draft" | "active" | "retired";

export interface PlanVersionRecord {
  id: string;
  version: number;
  name: string;
  state: PlanVersionState;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  sourcePlanVersionId: string | null;
  createdBy: string;
  createdAt: Date;
}

export interface StrategyNodeRecord {
  id: string;
  type: StrategyNodeType;
  nameEn: string;
  nameAr: string;
  planVersionId: string;
  state: StrategyNodeState;
  createdBy: string;
  createdAt: Date;
}

export interface StrategyEdgeRecord {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: StrategyEdgeType;
  planVersionId: string;
}

export interface OwnerAssignmentRecord {
  id: string;
  nodeId: string;
  userId: string;
  planVersionId: string;
  createdBy: string;
  createdAt: Date;
}

export interface RelationshipRuleRecord {
  id: string;
  fromType: StrategyNodeType;
  toType: StrategyNodeType;
  edgeType: StrategyEdgeType;
  minCount: number;
  maxCount: number | null;
}

interface PlanRow {
  id: string; version: number; name: string; state: PlanVersionState;
  effective_from: Date | null; effective_to: Date | null;
  source_plan_version_id: string | null; created_by: string; created_at: Date;
}
interface NodeRow {
  id: string; type: StrategyNodeType; name_en: string; name_ar: string;
  plan_version_id: string; state: StrategyNodeState; created_by: string; created_at: Date;
}
interface EdgeRow {
  id: string; from_node_id: string; to_node_id: string;
  edge_type: StrategyEdgeType; plan_version_id: string;
}
interface OwnerRow {
  id: string; node_id: string; user_id: string; plan_version_id: string;
  created_by: string; created_at: Date;
}
interface RuleRow {
  id: string; from_type: StrategyNodeType; to_type: StrategyNodeType;
  edge_type: StrategyEdgeType; min_count: number; max_count: number | null;
}

const plan = (row: PlanRow): PlanVersionRecord => ({
  id: row.id, version: row.version, name: row.name, state: row.state,
  effectiveFrom: row.effective_from, effectiveTo: row.effective_to,
  sourcePlanVersionId: row.source_plan_version_id,
  createdBy: row.created_by, createdAt: row.created_at,
});
const node = (row: NodeRow): StrategyNodeRecord => ({
  id: row.id, type: row.type, nameEn: row.name_en, nameAr: row.name_ar,
  planVersionId: row.plan_version_id, state: row.state,
  createdBy: row.created_by, createdAt: row.created_at,
});
const edge = (row: EdgeRow): StrategyEdgeRecord => ({
  id: row.id, fromNodeId: row.from_node_id, toNodeId: row.to_node_id,
  edgeType: row.edge_type, planVersionId: row.plan_version_id,
});
const owner = (row: OwnerRow): OwnerAssignmentRecord => ({
  id: row.id, nodeId: row.node_id, userId: row.user_id,
  planVersionId: row.plan_version_id, createdBy: row.created_by, createdAt: row.created_at,
});
const rule = (row: RuleRow): RelationshipRuleRecord => ({
  id: row.id, fromType: row.from_type, toType: row.to_type,
  edgeType: row.edge_type, minCount: row.min_count, maxCount: row.max_count,
});

export class StrategyService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlanVersions(): Promise<PlanVersionRecord[]> {
    const rows = await this.prisma.$queryRawUnsafe<PlanRow[]>(
      `SELECT * FROM strategy.plan_versions ORDER BY version DESC`,
    );
    return rows.map(plan);
  }

  async getPlanVersion(id: string): Promise<PlanVersionRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<PlanRow[]>(
      `SELECT * FROM strategy.plan_versions WHERE id = $1::uuid`, id,
    );
    return rows[0] ? plan(rows[0]) : null;
  }

  async createPlanVersion(input: {
    name: string; createdBy: string; sourcePlanVersionId?: string | null;
  }): Promise<PlanVersionRecord> {
    if (input.sourcePlanVersionId) {
      return this.clonePlanVersion(input.sourcePlanVersionId, input.name, input.createdBy);
    }
    const rows = await this.prisma.$queryRawUnsafe<PlanRow[]>(
      `INSERT INTO strategy.plan_versions (id, version, name, state, source_plan_version_id, created_by)
       VALUES ($1::uuid, (SELECT COALESCE(MAX(version), 0) + 1 FROM strategy.plan_versions), $2, 'draft', NULL, $3::uuid)
       RETURNING *`,
      randomUUID(), input.name.trim(), input.createdBy,
    );
    return plan(rows[0]!);
  }

  async createNode(input: {
    type: StrategyNodeType; nameEn: string; nameAr: string;
    planVersionId: string; createdBy: string;
  }): Promise<StrategyNodeRecord> {
    await this.assertDraftPlan(input.planVersionId);
    const rows = await this.prisma.$queryRawUnsafe<NodeRow[]>(
      `INSERT INTO strategy.strategy_nodes
       (id, type, name_en, name_ar, plan_version_id, state, created_by)
       VALUES ($1::uuid, $2::strategy."StrategyNodeType", $3, $4, $5::uuid, 'draft', $6::uuid)
       RETURNING *`,
      randomUUID(), input.type, input.nameEn.trim(), input.nameAr.trim(), input.planVersionId, input.createdBy,
    );
    return node(rows[0]!);
  }

  async createEdge(input: {
    fromNodeId: string; toNodeId: string; edgeType: StrategyEdgeType; planVersionId: string;
  }): Promise<StrategyEdgeRecord> {
    await this.assertDraftPlan(input.planVersionId);
    const rows = await this.prisma.$queryRawUnsafe<EdgeRow[]>(
      `INSERT INTO strategy.strategy_edges (id, from_node_id, to_node_id, edge_type, plan_version_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::strategy."StrategyEdgeType", $5::uuid)
       RETURNING *`,
      randomUUID(), input.fromNodeId, input.toNodeId, input.edgeType, input.planVersionId,
    );
    return edge(rows[0]!);
  }

  async assignOwner(input: {
    nodeId: string; userId: string; planVersionId: string; createdBy: string;
  }): Promise<OwnerAssignmentRecord> {
    await this.assertDraftPlan(input.planVersionId);
    const rows = await this.prisma.$queryRawUnsafe<OwnerRow[]>(
      `INSERT INTO strategy.owner_assignments
       (id, node_id, user_id, plan_version_id, created_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)
       ON CONFLICT (node_id, user_id, plan_version_id)
       DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`,
      randomUUID(), input.nodeId, input.userId, input.planVersionId, input.createdBy,
    );
    return owner(rows[0]!);
  }

  async removeOwner(nodeId: string, userId: string, planVersionId: string): Promise<void> {
    await this.assertDraftPlan(planVersionId);
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM strategy.owner_assignments
       WHERE node_id = $1::uuid AND user_id = $2::uuid AND plan_version_id = $3::uuid`,
      nodeId, userId, planVersionId,
    );
  }

  async getGraph(planVersionId: string): Promise<{
    planVersion: PlanVersionRecord;
    nodes: StrategyNodeRecord[];
    edges: StrategyEdgeRecord[];
    owners: OwnerAssignmentRecord[];
    relationshipRules: RelationshipRuleRecord[];
  }> {
    const [version, nodes, edges, owners, rules] = await Promise.all([
      this.getPlanVersion(planVersionId),
      this.prisma.$queryRawUnsafe<NodeRow[]>(
        `SELECT * FROM strategy.strategy_nodes WHERE plan_version_id = $1::uuid ORDER BY created_at, id`, planVersionId,
      ),
      this.prisma.$queryRawUnsafe<EdgeRow[]>(
        `SELECT * FROM strategy.strategy_edges WHERE plan_version_id = $1::uuid ORDER BY id`, planVersionId,
      ),
      this.prisma.$queryRawUnsafe<OwnerRow[]>(
        `SELECT * FROM strategy.owner_assignments WHERE plan_version_id = $1::uuid ORDER BY created_at, id`, planVersionId,
      ),
      this.prisma.$queryRawUnsafe<RuleRow[]>(
        `SELECT * FROM strategy.relationship_rules ORDER BY from_type, edge_type, to_type`,
      ),
    ]);
    if (!version) throw new Error("Plan version not found");
    return {
      planVersion: version,
      nodes: nodes.map(node),
      edges: edges.map(edge),
      owners: owners.map(owner),
      relationshipRules: rules.map(rule),
    };
  }

  async validatePlanVersion(planVersionId: string): Promise<void> {
    const violations = await this.prisma.$queryRawUnsafe<Array<{
      node_id: string; from_type: StrategyNodeType; to_type: StrategyNodeType;
      edge_type: StrategyEdgeType; actual_count: number; min_count: number; max_count: number | null;
    }>>(
      `SELECT n.id AS node_id, r.from_type, r.to_type, r.edge_type,
              COUNT(e.id)::int AS actual_count, r.min_count, r.max_count
       FROM strategy.strategy_nodes n
       JOIN strategy.relationship_rules r ON r.from_type = n.type
       LEFT JOIN strategy.strategy_edges e
         ON e.from_node_id = n.id AND e.edge_type = r.edge_type
       LEFT JOIN strategy.strategy_nodes target
         ON target.id = e.to_node_id AND target.type = r.to_type
       WHERE n.plan_version_id = $1::uuid
       GROUP BY n.id, r.id, r.from_type, r.to_type, r.edge_type, r.min_count, r.max_count
       HAVING COUNT(target.id) < r.min_count
          OR (r.max_count IS NOT NULL AND COUNT(target.id) > r.max_count)`,
      planVersionId,
    );
    if (violations.length > 0) {
      throw new Error(`Strategy plan violates ${violations.length} relationship cardinality rule(s)`);
    }

    const cycle = await this.prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
      `WITH RECURSIVE walk(start_id, node_id, path, cycle) AS (
         SELECT from_node_id, to_node_id, ARRAY[from_node_id, to_node_id], from_node_id = to_node_id
         FROM strategy.strategy_edges WHERE plan_version_id = $1::uuid
         UNION ALL
         SELECT w.start_id, e.to_node_id, w.path || e.to_node_id, e.to_node_id = ANY(w.path)
         FROM walk w
         JOIN strategy.strategy_edges e ON e.from_node_id = w.node_id AND e.plan_version_id = $1::uuid
         WHERE NOT w.cycle
       )
       SELECT EXISTS(SELECT 1 FROM walk WHERE cycle) AS found`,
      planVersionId,
    );
    if (cycle[0]?.found) throw new Error("Strategy graph contains a directed cycle");
  }

  async activatePlanVersion(planVersionId: string, effectiveFrom = new Date()): Promise<PlanVersionRecord> {
    await this.assertDraftPlan(planVersionId);
    await this.validatePlanVersion(planVersionId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE strategy.plan_versions
         SET state = 'retired', effective_to = $1
         WHERE state = 'active' AND id <> $2::uuid`,
        effectiveFrom, planVersionId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE strategy.strategy_nodes n SET state = 'retired'
         FROM strategy.plan_versions p
         WHERE n.plan_version_id = p.id AND p.state = 'retired' AND n.state = 'active'`,
      );
      const rows = await tx.$queryRawUnsafe<PlanRow[]>(
        `UPDATE strategy.plan_versions
         SET state = 'active', effective_from = $1, effective_to = NULL
         WHERE id = $2::uuid RETURNING *`,
        effectiveFrom, planVersionId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE strategy.strategy_nodes SET state = 'active' WHERE plan_version_id = $1::uuid AND state = 'draft'`,
        planVersionId,
      );
      return plan(rows[0]!);
    });
  }

  async retirePlanVersion(planVersionId: string, effectiveTo = new Date()): Promise<PlanVersionRecord> {
    const current = await this.getPlanVersion(planVersionId);
    if (!current || current.state === "retired") throw new Error("Plan version is already retired or missing");
    const rows = await this.prisma.$queryRawUnsafe<PlanRow[]>(
      `UPDATE strategy.plan_versions SET state = 'retired', effective_to = $1 WHERE id = $2::uuid RETURNING *`,
      effectiveTo, planVersionId,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE strategy.strategy_nodes SET state = 'retired' WHERE plan_version_id = $1::uuid`, planVersionId,
    );
    return plan(rows[0]!);
  }

  async clonePlanVersion(sourcePlanVersionId: string, name: string, createdBy: string): Promise<PlanVersionRecord> {
    const source = await this.getGraph(sourcePlanVersionId);
    return this.prisma.$transaction(async (tx) => {
      const versionRows = await tx.$queryRawUnsafe<PlanRow[]>(
        `INSERT INTO strategy.plan_versions (id, version, name, state, source_plan_version_id, created_by)
         VALUES ($1::uuid, (SELECT COALESCE(MAX(version), 0) + 1 FROM strategy.plan_versions), $2, 'draft', $3::uuid, $4::uuid)
         RETURNING *`,
        randomUUID(), name.trim(), sourcePlanVersionId, createdBy,
      );
      const created = plan(versionRows[0]!);
      const idMap = new Map<string, string>();

      for (const sourceNode of source.nodes) {
        const newId = randomUUID();
        idMap.set(sourceNode.id, newId);
        await tx.$executeRawUnsafe(
          `INSERT INTO strategy.strategy_nodes
           (id, type, name_en, name_ar, plan_version_id, state, created_by)
           VALUES ($1::uuid, $2::strategy."StrategyNodeType", $3, $4, $5::uuid, 'draft', $6::uuid)`,
          newId, sourceNode.type, sourceNode.nameEn, sourceNode.nameAr, created.id, createdBy,
        );
      }

      for (const sourceEdge of source.edges) {
        await tx.$executeRawUnsafe(
          `INSERT INTO strategy.strategy_edges
           (id, from_node_id, to_node_id, edge_type, plan_version_id)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::strategy."StrategyEdgeType", $5::uuid)`,
          randomUUID(), idMap.get(sourceEdge.fromNodeId)!, idMap.get(sourceEdge.toNodeId)!, sourceEdge.edgeType, created.id,
        );
      }

      for (const sourceOwner of source.owners) {
        await tx.$executeRawUnsafe(
          `INSERT INTO strategy.owner_assignments
           (id, node_id, user_id, plan_version_id, created_by)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)`,
          randomUUID(), idMap.get(sourceOwner.nodeId)!, sourceOwner.userId, created.id, createdBy,
        );
      }
      return created;
    });
  }

  private async assertDraftPlan(planVersionId: string): Promise<void> {
    const version = await this.getPlanVersion(planVersionId);
    if (!version || version.state !== "draft") {
      throw new Error("Strategy plan version must be in draft state");
    }
  }
}

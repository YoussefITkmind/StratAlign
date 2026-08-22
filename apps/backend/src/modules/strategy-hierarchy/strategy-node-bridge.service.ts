import type { PrismaService } from "../../database/prisma.service";
import {
  StrategyNodeType,
  StrategyNodeState,
  StrategyEdgeType,
  PlanVersionStatus,
} from "../../generated/prisma/enums";
import type { NodeType } from "./strategy-hierarchy.service";

/**
 * Mirrors Strategy Hierarchy perspectives and objectives into the older
 * `strategy.StrategyNode` graph, which is what AI-suggestion generation and
 * every real KPI/OKR (`Okr.objectiveNodeId`, `Alignment.strategyNodeId`) is
 * actually keyed on. The two trees are intentionally separate models — see
 * the schema comment on `StrategyHierarchyNode` — so this is a one-way sync
 * at the boundary rather than a merge of either one into the other.
 *
 * Only `perspective` (-> theme) and `objective` (-> objective) are mirrored;
 * `plan`/`initiative`/`project` have no equivalent in the strategy graph and
 * are left alone. A mirrored row reuses its Strategy Hierarchy node's id, so
 * the two tables stay trivially correlated with no extra column.
 */
export class StrategyNodeBridgeService {
  constructor(private readonly prisma: PrismaService) {}

  private planVersionId: string | null = null;

  /** The single plan version every mirrored node/edge lives in. Never opened
   *  or closed — kept in draft so mirrored nodes need no governance workflow. */
  private async ensurePlanVersion(): Promise<string> {
    if (this.planVersionId) return this.planVersionId;

    const name = "Strategy Hierarchy Bridge";
    const existing = await this.prisma.planVersion.findFirst({ where: { name } });
    if (existing) {
      this.planVersionId = existing.id;
      return existing.id;
    }

    const created = await this.prisma.planVersion.create({
      data: { name, status: PlanVersionStatus.DRAFT },
    });
    this.planVersionId = created.id;
    return created.id;
  }

  /** Creates or updates the mirror for one hierarchy node, if its type has one. */
  async syncNode(node: { id: string; parentId: string | null; name: string; type: NodeType; createdBy: string }): Promise<void> {
    if (node.type === "perspective") {
      await this.upsertMirror(node.id, StrategyNodeType.THEME, node.name, node.createdBy);
      return;
    }

    if (node.type === "objective") {
      if (!node.parentId) return;
      // The parent mirror shares the parent hierarchy node's id by construction.
      const parentMirror = await this.prisma.strategyNode.findUnique({ where: { id: node.parentId } });
      if (!parentMirror) return; // Not nested under a mirrored perspective — nothing to hang an objective off.

      await this.upsertMirror(node.id, StrategyNodeType.OBJECTIVE, node.name, node.createdBy);
      const planVersionId = await this.ensurePlanVersion();
      await this.prisma.strategyEdge.upsert({
        where: {
          fromNodeId_toNodeId_edgeType_planVersionId: {
            fromNodeId: parentMirror.id,
            toNodeId: node.id,
            edgeType: StrategyEdgeType.CONTAINS,
            planVersionId,
          },
        },
        update: {},
        create: {
          fromNodeId: parentMirror.id,
          toNodeId: node.id,
          edgeType: StrategyEdgeType.CONTAINS,
          planVersionId,
        },
      });
    }
  }

  /** Keeps a mirror's display name in sync after a rename. No-op if unmirrored. */
  async renameNode(id: string, name: string): Promise<void> {
    await this.prisma.strategyNode.updateMany({
      where: { id },
      data: { nameEn: name, nameAr: name },
    });
  }

  /**
   * Retires a mirror after its hierarchy node is deleted. Best-effort: a
   * mirror already referenced by a real KPI, OKR, or measurement carries a
   * restrictive foreign key and cannot be removed — that data is real and
   * outlives the hierarchy edit, so the failure is swallowed rather than
   * blocking the delete the reviewer actually asked for.
   */
  async retireNode(id: string): Promise<void> {
    try {
      await this.prisma.strategyNode.updateMany({
        where: { id },
        data: { state: StrategyNodeState.RETIRED },
      });
    } catch {
      // Referenced elsewhere — leave it in place.
    }
  }

  /** One-time sync for nodes that existed before this bridge shipped. Idempotent. */
  async backfillAll(): Promise<{ perspectives: number; objectives: number }> {
    const perspectives = await this.prisma.strategyHierarchyNode.findMany({
      where: { type: "PERSPECTIVE" },
      orderBy: { createdAt: "asc" },
    });
    for (const node of perspectives) {
      await this.syncNode({ id: node.id, parentId: node.parentId, name: node.name, type: "perspective", createdBy: node.createdBy });
    }

    const objectives = await this.prisma.strategyHierarchyNode.findMany({
      where: { type: "OBJECTIVE" },
      orderBy: { createdAt: "asc" },
    });
    for (const node of objectives) {
      await this.syncNode({ id: node.id, parentId: node.parentId, name: node.name, type: "objective", createdBy: node.createdBy });
    }

    return { perspectives: perspectives.length, objectives: objectives.length };
  }

  private async upsertMirror(id: string, type: StrategyNodeType, name: string, createdBy: string): Promise<void> {
    const planVersionId = await this.ensurePlanVersion();
    await this.prisma.strategyNode.upsert({
      where: { id },
      update: { nameEn: name, nameAr: name, state: StrategyNodeState.ACTIVE },
      create: {
        id,
        type,
        nameEn: name,
        nameAr: name,
        planVersionId,
        state: StrategyNodeState.ACTIVE,
        createdBy,
      },
    });
  }
}

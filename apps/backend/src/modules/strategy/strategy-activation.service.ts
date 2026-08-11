import { randomUUID } from "node:crypto";
import type { PrismaService } from "../../database/prisma.service";
import type { EventBusService } from "../../events/event-bus.service";
import type { StagedChangeKind } from "./strategy.service";

interface StageRow {
  id: string;
  approval_case_id: string;
  plan_version_id: string;
  kind: StagedChangeKind;
  target_id: string | null;
  payload: Record<string, unknown>;
  requested_by: string;
}

export interface ActivationResult {
  stagedChangeId: string;
  kind: StagedChangeKind;
  aggregateId: string;
  eventType: "strategy.node.activated" | "strategy.edge.activated";
}

/** Applies exactly one approved staged strategy change and writes its activation event atomically. */
export class StrategyActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async activate(stagedChangeId: string, approvalCaseId: string): Promise<ActivationResult | null> {
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<StageRow[]>(`
        SELECT id, approval_case_id, plan_version_id, kind, target_id, payload, requested_by
        FROM strategy.staged_changes
        WHERE id = $1::uuid
          AND approval_case_id = $2::uuid
          AND status = 'pending'
        FOR UPDATE
      `, stagedChangeId, approvalCaseId);
      const change = rows[0];
      if (!change) return null;

      const payload = change.payload ?? {};
      let aggregateId = change.target_id ?? randomUUID();
      let eventType: ActivationResult["eventType"];

      if (change.kind === "node_create") {
        await tx.$executeRawUnsafe(`
          INSERT INTO strategy.strategy_nodes
            (id,type,name_en,name_ar,plan_version_id,state,created_by)
          VALUES ($1::uuid,$2::strategy."StrategyNodeType",$3,$4,$5::uuid,'active',$6)
        `, aggregateId, String(payload.type), String(payload.nameEn), String(payload.nameAr), change.plan_version_id, change.requested_by);
        eventType = "strategy.node.activated";
      } else if (change.kind === "node_update") {
        if (!change.target_id) throw new Error("Staged node update is missing target_id");
        await tx.$executeRawUnsafe(`
          UPDATE strategy.strategy_nodes
          SET name_en=COALESCE($2,name_en), name_ar=COALESCE($3,name_ar), state='active'
          WHERE id=$1::uuid
        `, change.target_id, typeof payload.nameEn === "string" ? payload.nameEn : null, typeof payload.nameAr === "string" ? payload.nameAr : null);
        aggregateId = change.target_id;
        eventType = "strategy.node.activated";
      } else if (change.kind === "node_retire") {
        if (!change.target_id) throw new Error("Staged node retirement is missing target_id");
        await tx.$executeRawUnsafe(`UPDATE strategy.strategy_nodes SET state='retired' WHERE id=$1::uuid`, change.target_id);
        aggregateId = change.target_id;
        eventType = "strategy.node.activated";
      } else if (change.kind === "edge_link") {
        await tx.$executeRawUnsafe(`
          INSERT INTO strategy.strategy_edges
            (id,from_node_id,to_node_id,edge_type,plan_version_id)
          VALUES ($1::uuid,$2::uuid,$3::uuid,$4::strategy."StrategyEdgeType",$5::uuid)
        `, aggregateId, String(payload.fromNodeId), String(payload.toNodeId), String(payload.edgeType), change.plan_version_id);
        eventType = "strategy.edge.activated";
      } else {
        if (!change.target_id) throw new Error("Staged edge unlink is missing target_id");
        await tx.$executeRawUnsafe(`DELETE FROM strategy.strategy_edges WHERE id=$1::uuid`, change.target_id);
        aggregateId = change.target_id;
        eventType = "strategy.edge.activated";
      }

      await tx.$executeRawUnsafe(`
        UPDATE strategy.staged_changes
        SET status='applied', applied_at=CURRENT_TIMESTAMP
        WHERE id=$1::uuid AND status='pending'
      `, change.id);

      await this.eventBus.publishWithin(tx, [{
        eventType,
        eventVersion: 1,
        aggregateType: eventType.startsWith("strategy.node") ? "strategy_node" : "strategy_edge",
        aggregateId,
        dedupeKey: `${eventType}:${change.id}`,
        payload: {
          domain: "strategy",
          stagedChangeId: change.id,
          approvalCaseId: change.approval_case_id,
          planVersionId: change.plan_version_id,
          kind: change.kind,
        },
      }]);

      return { stagedChangeId: change.id, kind: change.kind, aggregateId, eventType };
    });

    if (result) await this.eventBus.nudgeRelay();
    return result;
  }
}

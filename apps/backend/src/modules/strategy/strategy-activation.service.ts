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
      const rows = await tx.$queryRaw<StageRow[]>`
        SELECT id, approval_case_id, plan_version_id, kind, target_id, payload, requested_by
        FROM strategy.staged_changes
        WHERE id = ${stagedChangeId}::uuid
          AND approval_case_id = ${approvalCaseId}::uuid
          AND status = 'pending'
        FOR UPDATE
      `;
      const change = rows[0];
      if (!change) return null;

      const payload = change.payload ?? {};
      let aggregateId = change.target_id ?? randomUUID();
      let eventType: ActivationResult["eventType"];

      if (change.kind === "node_create") {
        await tx.$executeRaw`
          INSERT INTO strategy.strategy_nodes
            (id,type,name_en,name_ar,plan_version_id,state,created_by)
          VALUES (
            ${aggregateId}::uuid,
            ${String(payload.type)}::strategy."StrategyNodeType",
            ${String(payload.nameEn)},
            ${String(payload.nameAr)},
            ${change.plan_version_id}::uuid,
            'active',
            ${change.requested_by}
          )
        `;
        eventType = "strategy.node.activated";
      } else if (change.kind === "node_update") {
        if (!change.target_id) throw new Error("Staged node update is missing target_id");
        await tx.$executeRaw`
          UPDATE strategy.strategy_nodes
          SET
            name_en=COALESCE(${typeof payload.nameEn === "string" ? payload.nameEn : null},name_en),
            name_ar=COALESCE(${typeof payload.nameAr === "string" ? payload.nameAr : null},name_ar),
            state='active'
          WHERE id=${change.target_id}::uuid
        `;
        aggregateId = change.target_id;
        eventType = "strategy.node.activated";
      } else if (change.kind === "node_retire") {
        if (!change.target_id) throw new Error("Staged node retirement is missing target_id");
        await tx.$executeRaw`
          UPDATE strategy.strategy_nodes
          SET state='retired'
          WHERE id=${change.target_id}::uuid
        `;
        aggregateId = change.target_id;
        eventType = "strategy.node.activated";
      } else if (change.kind === "edge_link") {
        await tx.$executeRaw`
          INSERT INTO strategy.strategy_edges
            (id,from_node_id,to_node_id,edge_type,plan_version_id)
          VALUES (
            ${aggregateId}::uuid,
            ${String(payload.fromNodeId)}::uuid,
            ${String(payload.toNodeId)}::uuid,
            ${String(payload.edgeType)}::strategy."StrategyEdgeType",
            ${change.plan_version_id}::uuid
          )
        `;
        eventType = "strategy.edge.activated";
      } else {
        if (!change.target_id) throw new Error("Staged edge unlink is missing target_id");
        await tx.$executeRaw`
          DELETE FROM strategy.strategy_edges
          WHERE id=${change.target_id}::uuid
        `;
        aggregateId = change.target_id;
        eventType = "strategy.edge.activated";
      }

      await tx.$executeRaw`
        UPDATE strategy.staged_changes
        SET status='applied', applied_at=CURRENT_TIMESTAMP
        WHERE id=${change.id}::uuid AND status='pending'
      `;

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

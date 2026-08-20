import { randomUUID } from "node:crypto";
import type { PrismaService } from "../../database/prisma.service";

export type StrategyNodeType = "corporate_strategy" | "theme" | "objective" | "strategic_play" | "portfolio" | "area_of_focus";
export type StrategyNodeState = "draft" | "active" | "retired";
export type StrategyEdgeType = "contains" | "executed_by" | "belongs_to_portfolio" | "aligns_to";
export type PlanVersionStatus = "draft" | "active" | "closed";
export type StagedChangeKind = "node_create" | "node_update" | "node_retire" | "edge_link" | "edge_unlink";

export interface PlanVersionRecord { id: string; name: string; status: PlanVersionStatus; opensAt: Date | null; closesAt: Date | null; sourcePlanVersionId: string | null; }
export interface StrategyNodeRecord { id: string; type: StrategyNodeType; nameEn: string; nameAr: string; descriptionEn?: string | null; descriptionAr?: string | null; planVersionId: string; state: StrategyNodeState; createdBy: string; createdAt: Date; }
export interface StrategyEdgeRecord { id: string; fromNodeId: string; toNodeId: string; edgeType: StrategyEdgeType; planVersionId: string; }
export interface OwnerAssignmentRecord { id: string; nodeId: string; ownerUserId: string; assignedBy: string; assignedAt: Date; }
export interface StagedChangeRecord { id: string; approvalCaseId: string; planVersionId: string; kind: StagedChangeKind; targetId: string | null; payload: Record<string, unknown>; status: "pending" | "applied" | "cancelled"; requestedBy: string; requestedAt: Date; appliedAt: Date | null; }

interface PlanRow { id: string; name: string; status: PlanVersionStatus; opens_at: Date | null; closes_at: Date | null; source_plan_version_id: string | null; }
interface NodeRow { id: string; type: StrategyNodeType; name_en: string; name_ar: string; description_en?: string | null; description_ar?: string | null; plan_version_id: string; state: StrategyNodeState; created_by: string; created_at: Date; }
interface EdgeRow { id: string; from_node_id: string; to_node_id: string; edge_type: StrategyEdgeType; plan_version_id: string; }
interface OwnerRow { id: string; node_id: string; owner_user_id: string; assigned_by: string; assigned_at: Date; }
interface StageRow { id: string; approval_case_id: string; plan_version_id: string; kind: StagedChangeKind; target_id: string | null; payload: Record<string, unknown>; status: "pending" | "applied" | "cancelled"; requested_by: string; requested_at: Date; applied_at: Date | null; }

const mapPlan = (r: PlanRow): PlanVersionRecord => ({ id: r.id, name: r.name, status: r.status, opensAt: r.opens_at, closesAt: r.closes_at, sourcePlanVersionId: r.source_plan_version_id });
const mapNode = (r: NodeRow): StrategyNodeRecord => ({ id: r.id, type: r.type, nameEn: r.name_en, nameAr: r.name_ar, descriptionEn: r.description_en, descriptionAr: r.description_ar, planVersionId: r.plan_version_id, state: r.state, createdBy: r.created_by, createdAt: r.created_at });
const mapEdge = (r: EdgeRow): StrategyEdgeRecord => ({ id: r.id, fromNodeId: r.from_node_id, toNodeId: r.to_node_id, edgeType: r.edge_type, planVersionId: r.plan_version_id });
const mapOwner = (r: OwnerRow): OwnerAssignmentRecord => ({ id: r.id, nodeId: r.node_id, ownerUserId: r.owner_user_id, assignedBy: r.assigned_by, assignedAt: r.assigned_at });
const mapStage = (r: StageRow): StagedChangeRecord => ({ id: r.id, approvalCaseId: r.approval_case_id, planVersionId: r.plan_version_id, kind: r.kind, targetId: r.target_id, payload: r.payload, status: r.status, requestedBy: r.requested_by, requestedAt: r.requested_at, appliedAt: r.applied_at });

export class StrategyService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlanVersion(id: string): Promise<PlanVersionRecord | null> {
    const rows = await this.prisma.$queryRaw<PlanRow[]>`SELECT * FROM strategy.plan_versions WHERE id=${id}::uuid`;
    return rows[0] ? mapPlan(rows[0]) : null;
  }

  async createPlanVersion(name: string): Promise<PlanVersionRecord> {
    const rows = await this.prisma.$queryRaw<PlanRow[]>`INSERT INTO strategy.plan_versions (id,name,status) VALUES (${randomUUID()}::uuid,${name.trim()},'draft') RETURNING *`;
    return mapPlan(rows[0]!);
  }

  async createNode(input: { type: StrategyNodeType; nameEn: string; nameAr: string; descriptionEn?: string; descriptionAr?: string; planVersionId: string; actorUserId: string; approvalCaseId?: string; stagedChangeId?: string }): Promise<StrategyNodeRecord | StagedChangeRecord> {
    const plan = await this.requirePlan(input.planVersionId);
    if (plan.status === "active") return this.stage("node_create", null, input.planVersionId, { type: input.type, nameEn: input.nameEn.trim(), nameAr: input.nameAr.trim(), descriptionEn: input.descriptionEn?.trim(), descriptionAr: input.descriptionAr?.trim() }, input.actorUserId, this.requireApproval(input.approvalCaseId), input.stagedChangeId);
    this.assertDraft(plan);
    const rows = await this.prisma.$queryRaw<NodeRow[]>`INSERT INTO strategy.strategy_nodes (id,type,name_en,name_ar,description_en,description_ar,plan_version_id,state,created_by) VALUES (${randomUUID()}::uuid,${input.type}::strategy."StrategyNodeType",${input.nameEn.trim()},${input.nameAr.trim()},${input.descriptionEn?.trim() ?? null},${input.descriptionAr?.trim() ?? null},${input.planVersionId}::uuid,'draft',${input.actorUserId}) RETURNING *`;
    return mapNode(rows[0]!);
  }

  async updateNode(input: { nodeId: string; nameEn?: string; nameAr?: string; actorUserId: string; approvalCaseId?: string }): Promise<StrategyNodeRecord | StagedChangeRecord> {
    const current = await this.requireNode(input.nodeId); const plan = await this.requirePlan(current.planVersionId);
    const payload = { nameEn: input.nameEn?.trim(), nameAr: input.nameAr?.trim() };
    if (current.state === "active" || plan.status === "active") return this.stage("node_update", current.id, current.planVersionId, payload, input.actorUserId, this.requireApproval(input.approvalCaseId));
    this.assertDraft(plan);
    const rows = await this.prisma.$queryRaw<NodeRow[]>`UPDATE strategy.strategy_nodes SET name_en=COALESCE(${payload.nameEn ?? null},name_en),name_ar=COALESCE(${payload.nameAr ?? null},name_ar) WHERE id=${input.nodeId}::uuid RETURNING *`;
    return mapNode(rows[0]!);
  }

  async retireNode(input: { nodeId: string; actorUserId: string; approvalCaseId?: string }): Promise<StrategyNodeRecord | StagedChangeRecord> {
    const current = await this.requireNode(input.nodeId); const plan = await this.requirePlan(current.planVersionId);
    if (current.state === "active" || plan.status === "active") return this.stage("node_retire", current.id, current.planVersionId, {}, input.actorUserId, this.requireApproval(input.approvalCaseId));
    const rows = await this.prisma.$queryRaw<NodeRow[]>`UPDATE strategy.strategy_nodes SET state='retired' WHERE id=${input.nodeId}::uuid RETURNING *`;
    return mapNode(rows[0]!);
  }

  async linkEdge(input: { fromNodeId: string; toNodeId: string; edgeType: StrategyEdgeType; planVersionId: string; actorUserId: string; approvalCaseId?: string; stagedChangeId?: string }): Promise<StrategyEdgeRecord | StagedChangeRecord> {
    const plan = await this.requirePlan(input.planVersionId); const payload = { fromNodeId: input.fromNodeId, toNodeId: input.toNodeId, edgeType: input.edgeType };
    if (plan.status === "active") return this.stage("edge_link", null, input.planVersionId, payload, input.actorUserId, this.requireApproval(input.approvalCaseId), input.stagedChangeId);
    this.assertDraft(plan); return this.insertEdge(payload, input.planVersionId);
  }

  async unlinkEdge(input: { edgeId: string; actorUserId: string; approvalCaseId?: string }): Promise<{ unlinked: true } | StagedChangeRecord> {
    const edge = await this.requireEdge(input.edgeId); const plan = await this.requirePlan(edge.planVersionId);
    if (plan.status === "active") return this.stage("edge_unlink", edge.id, edge.planVersionId, {}, input.actorUserId, this.requireApproval(input.approvalCaseId));
    this.assertDraft(plan); await this.prisma.$executeRaw`DELETE FROM strategy.strategy_edges WHERE id=${edge.id}::uuid`; return { unlinked: true };
  }

  async assignOwner(input: { nodeId: string; ownerUserId: string; assignedBy: string }): Promise<OwnerAssignmentRecord> {
    const node = await this.requireNode(input.nodeId); const plan = await this.requirePlan(node.planVersionId);
    if (plan.status === "closed") throw new Error("Cannot assign an owner in a closed plan version");
    const rows = await this.prisma.$queryRaw<OwnerRow[]>`INSERT INTO strategy.owner_assignments (id,node_id,owner_user_id,assigned_by) VALUES (${randomUUID()}::uuid,${input.nodeId}::uuid,${input.ownerUserId},${input.assignedBy}) ON CONFLICT (node_id,owner_user_id) DO UPDATE SET assigned_by=EXCLUDED.assigned_by,assigned_at=CURRENT_TIMESTAMP RETURNING *`;
    return mapOwner(rows[0]!);
  }

  async openPlanVersion(planVersionId: string, opensAt = new Date()): Promise<PlanVersionRecord> {
    const plan = await this.requirePlan(planVersionId); this.assertDraft(plan); await this.validateMinimumCardinality(planVersionId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE strategy.plan_versions SET status='closed',closes_at=${opensAt} WHERE status='active' AND id<>${planVersionId}::uuid`;
      const rows = await tx.$queryRaw<PlanRow[]>`UPDATE strategy.plan_versions SET status='active',opens_at=${opensAt},closes_at=NULL WHERE id=${planVersionId}::uuid RETURNING *`;
      await tx.$executeRaw`UPDATE strategy.strategy_nodes SET state='active' WHERE plan_version_id=${planVersionId}::uuid AND state='draft'`;
      return mapPlan(rows[0]!);
    });
  }

  async closePlanVersion(planVersionId: string, closesAt = new Date()): Promise<PlanVersionRecord> {
    const plan = await this.requirePlan(planVersionId); if (plan.status !== "active") throw new Error("Only an active plan version can be closed");
    const rows = await this.prisma.$queryRaw<PlanRow[]>`UPDATE strategy.plan_versions SET status='closed',closes_at=${closesAt} WHERE id=${planVersionId}::uuid RETURNING *`; return mapPlan(rows[0]!);
  }

  async carryForward(sourcePlanVersionId: string, newName: string, actorUserId: string): Promise<PlanVersionRecord> {
    const source = await this.requirePlan(sourcePlanVersionId); if (source.status === "draft") throw new Error("Carry-forward requires an active or closed source plan");
    return this.prisma.$transaction(async (tx) => {
      const planRows = await tx.$queryRaw<PlanRow[]>`INSERT INTO strategy.plan_versions (id,name,status,source_plan_version_id) VALUES (${randomUUID()}::uuid,${newName.trim()},'draft',${sourcePlanVersionId}::uuid) RETURNING *`;
      const target = mapPlan(planRows[0]!); const sourceNodes = await tx.$queryRaw<NodeRow[]>`SELECT * FROM strategy.strategy_nodes WHERE plan_version_id=${sourcePlanVersionId}::uuid AND state='active' ORDER BY created_at,id`; const ids = new Map<string,string>();
      for (const n of sourceNodes) { const id=randomUUID(); ids.set(n.id,id); await tx.$executeRaw`INSERT INTO strategy.strategy_nodes (id,type,name_en,name_ar,plan_version_id,state,created_by) VALUES (${id}::uuid,${n.type}::strategy."StrategyNodeType",${n.name_en},${n.name_ar},${target.id}::uuid,'draft',${actorUserId})`; }
      const edges=await tx.$queryRaw<EdgeRow[]>`SELECT * FROM strategy.strategy_edges WHERE plan_version_id=${sourcePlanVersionId}::uuid`;
      for (const e of edges) { const f=ids.get(e.from_node_id),t=ids.get(e.to_node_id); if(f&&t) await tx.$executeRaw`INSERT INTO strategy.strategy_edges (id,from_node_id,to_node_id,edge_type,plan_version_id) VALUES (${randomUUID()}::uuid,${f}::uuid,${t}::uuid,${e.edge_type}::strategy."StrategyEdgeType",${target.id}::uuid)`; }
      const owners=await tx.$queryRaw<OwnerRow[]>`SELECT o.* FROM strategy.owner_assignments o JOIN strategy.strategy_nodes n ON n.id=o.node_id WHERE n.plan_version_id=${sourcePlanVersionId}::uuid AND n.state='active'`;
      for(const o of owners){const n=ids.get(o.node_id);if(n) await tx.$executeRaw`INSERT INTO strategy.owner_assignments (id,node_id,owner_user_id,assigned_by) VALUES (${randomUUID()}::uuid,${n}::uuid,${o.owner_user_id},${actorUserId})`;}
      return target;
    });
  }

  async applyApprovedChanges(approvalCaseId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const changes=await tx.$queryRaw<StageRow[]>`SELECT * FROM strategy.staged_changes WHERE approval_case_id=${approvalCaseId}::uuid AND status='pending' ORDER BY requested_at,id FOR UPDATE`;
      for(const c of changes){const p=c.payload??{};
        if(c.kind==="node_create") await tx.$executeRaw`INSERT INTO strategy.strategy_nodes (id,type,name_en,name_ar,plan_version_id,state,created_by) VALUES (${randomUUID()}::uuid,${String(p.type)}::strategy."StrategyNodeType",${String(p.nameEn)},${String(p.nameAr)},${c.plan_version_id}::uuid,'active',${c.requested_by})`;
        else if(c.kind==="node_update") await tx.$executeRaw`UPDATE strategy.strategy_nodes SET name_en=COALESCE(${typeof p.nameEn==="string"?p.nameEn:null},name_en),name_ar=COALESCE(${typeof p.nameAr==="string"?p.nameAr:null},name_ar) WHERE id=${c.target_id}::uuid`;
        else if(c.kind==="node_retire") await tx.$executeRaw`UPDATE strategy.strategy_nodes SET state='retired' WHERE id=${c.target_id}::uuid`;
        else if(c.kind==="edge_link") await tx.$executeRaw`INSERT INTO strategy.strategy_edges (id,from_node_id,to_node_id,edge_type,plan_version_id) VALUES (${randomUUID()}::uuid,${String(p.fromNodeId)}::uuid,${String(p.toNodeId)}::uuid,${String(p.edgeType)}::strategy."StrategyEdgeType",${c.plan_version_id}::uuid)`;
        else if(c.kind==="edge_unlink") await tx.$executeRaw`DELETE FROM strategy.strategy_edges WHERE id=${c.target_id}::uuid`;
      }
      await tx.$executeRaw`UPDATE strategy.staged_changes SET status='applied',applied_at=CURRENT_TIMESTAMP WHERE approval_case_id=${approvalCaseId}::uuid AND status='pending'`; return changes.length;
    });
  }

  async listActiveNodes(planVersionId:string):Promise<StrategyNodeRecord[]>{const r=await this.prisma.$queryRaw<NodeRow[]>`SELECT * FROM strategy.strategy_nodes WHERE plan_version_id=${planVersionId}::uuid AND state='active' ORDER BY created_at,id`;return r.map(mapNode);}
  async listNodes():Promise<StrategyNodeRecord[]>{const r=await this.prisma.$queryRaw<NodeRow[]>`SELECT * FROM strategy.strategy_nodes WHERE state<>'retired' ORDER BY plan_version_id,created_at,id`;return r.map(mapNode);}
  async getNode(nodeId:string):Promise<StrategyNodeRecord|null>{const r=await this.prisma.$queryRaw<NodeRow[]>`SELECT * FROM strategy.strategy_nodes WHERE id=${nodeId}::uuid`;return r[0]?mapNode(r[0]):null;}
  async listPlanVersions():Promise<PlanVersionRecord[]>{const r=await this.prisma.$queryRaw<PlanRow[]>`SELECT * FROM strategy.plan_versions ORDER BY opens_at DESC NULLS LAST,id`;return r.map(mapPlan);}
  async getEdges(planVersionId:string):Promise<StrategyEdgeRecord[]>{const r=await this.prisma.$queryRaw<EdgeRow[]>`SELECT * FROM strategy.strategy_edges WHERE plan_version_id=${planVersionId}::uuid ORDER BY id`;return r.map(mapEdge);}
  async listStagedChanges(planVersionId:string):Promise<StagedChangeRecord[]>{const r=await this.prisma.$queryRaw<StageRow[]>`SELECT * FROM strategy.staged_changes WHERE plan_version_id=${planVersionId}::uuid ORDER BY requested_at DESC,id`;return r.map(mapStage);}

  private async insertEdge(p:{fromNodeId:string;toNodeId:string;edgeType:StrategyEdgeType},planVersionId:string):Promise<StrategyEdgeRecord>{const r=await this.prisma.$queryRaw<EdgeRow[]>`INSERT INTO strategy.strategy_edges (id,from_node_id,to_node_id,edge_type,plan_version_id) VALUES (${randomUUID()}::uuid,${p.fromNodeId}::uuid,${p.toNodeId}::uuid,${p.edgeType}::strategy."StrategyEdgeType",${planVersionId}::uuid) RETURNING *`;return mapEdge(r[0]!);}
  private async stage(kind:StagedChangeKind,targetId:string|null,planVersionId:string,payload:Record<string,unknown>,requestedBy:string,approvalCaseId:string,stagedChangeId?:string):Promise<StagedChangeRecord>{const r=await this.prisma.$queryRaw<StageRow[]>`INSERT INTO strategy.staged_changes (id,approval_case_id,plan_version_id,kind,target_id,payload,requested_by) VALUES (${stagedChangeId??randomUUID()}::uuid,${approvalCaseId}::uuid,${planVersionId}::uuid,${kind}::strategy."StagedChangeKind",${targetId}::uuid,${JSON.stringify(payload)}::jsonb,${requestedBy}) RETURNING *`;return mapStage(r[0]!);}
  private requireApproval(id?:string):string{if(!id)throw new Error("approvalCaseId is required for changes to active strategy data");return id;}
  private assertDraft(p:PlanVersionRecord):void{if(p.status!=="draft")throw new Error("Strategy plan version must be draft");}
  private async requirePlan(id:string):Promise<PlanVersionRecord>{const p=await this.getPlanVersion(id);if(!p)throw new Error("Plan version not found");return p;}
  private async requireNode(id:string):Promise<StrategyNodeRecord>{const r=await this.prisma.$queryRaw<NodeRow[]>`SELECT * FROM strategy.strategy_nodes WHERE id=${id}::uuid`;if(!r[0])throw new Error("Strategy node not found");return mapNode(r[0]);}
  private async requireEdge(id:string):Promise<StrategyEdgeRecord>{const r=await this.prisma.$queryRaw<EdgeRow[]>`SELECT * FROM strategy.strategy_edges WHERE id=${id}::uuid`;if(!r[0])throw new Error("Strategy edge not found");return mapEdge(r[0]);}
  private async validateMinimumCardinality(planVersionId:string):Promise<void>{const r=await this.prisma.$queryRaw<Array<{id:string}>>`SELECT n.id FROM strategy.strategy_nodes n JOIN strategy.relationship_rules rr ON rr.from_type=n.type LEFT JOIN strategy.strategy_edges e ON e.from_node_id=n.id AND e.edge_type=rr.edge_type LEFT JOIN strategy.strategy_nodes t ON t.id=e.to_node_id AND t.type=rr.to_type WHERE n.plan_version_id=${planVersionId}::uuid AND n.state<>'retired' GROUP BY n.id,rr.id,rr.min_count HAVING COUNT(t.id)<rr.min_count LIMIT 1`;if(r.length)throw new Error("Strategy plan violates minimum relationship cardinality");}
}

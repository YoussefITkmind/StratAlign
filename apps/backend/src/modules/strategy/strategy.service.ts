import { randomUUID } from "node:crypto";
import type { PrismaService } from "../../database/prisma.service";

export type StrategyNodeType = "corporate_strategy" | "theme" | "objective" | "strategic_play" | "portfolio" | "area_of_focus";
export type StrategyNodeState = "draft" | "active" | "retired";
export type StrategyEdgeType = "contains" | "executed_by" | "belongs_to_portfolio" | "aligns_to";
export type PlanVersionStatus = "draft" | "active" | "closed";
export type StagedChangeKind = "node_create" | "node_update" | "node_retire" | "edge_link" | "edge_unlink";

export interface PlanVersionRecord { id: string; name: string; status: PlanVersionStatus; opensAt: Date | null; closesAt: Date | null; sourcePlanVersionId: string | null; }
export interface StrategyNodeRecord { id: string; type: StrategyNodeType; nameEn: string; nameAr: string; planVersionId: string; state: StrategyNodeState; createdBy: string; createdAt: Date; }
export interface StrategyEdgeRecord { id: string; fromNodeId: string; toNodeId: string; edgeType: StrategyEdgeType; planVersionId: string; }
export interface OwnerAssignmentRecord { id: string; nodeId: string; ownerUserId: string; assignedBy: string; assignedAt: Date; }
export interface StagedChangeRecord { id: string; approvalCaseId: string; planVersionId: string; kind: StagedChangeKind; targetId: string | null; payload: Record<string, unknown>; status: "pending" | "applied" | "cancelled"; requestedBy: string; requestedAt: Date; appliedAt: Date | null; }

interface PlanRow { id: string; name: string; status: PlanVersionStatus; opens_at: Date | null; closes_at: Date | null; source_plan_version_id: string | null; }
interface NodeRow { id: string; type: StrategyNodeType; name_en: string; name_ar: string; plan_version_id: string; state: StrategyNodeState; created_by: string; created_at: Date; }
interface EdgeRow { id: string; from_node_id: string; to_node_id: string; edge_type: StrategyEdgeType; plan_version_id: string; }
interface OwnerRow { id: string; node_id: string; owner_user_id: string; assigned_by: string; assigned_at: Date; }
interface StageRow { id: string; approval_case_id: string; plan_version_id: string; kind: StagedChangeKind; target_id: string | null; payload: Record<string, unknown>; status: "pending" | "applied" | "cancelled"; requested_by: string; requested_at: Date; applied_at: Date | null; }

const mapPlan = (r: PlanRow): PlanVersionRecord => ({ id: r.id, name: r.name, status: r.status, opensAt: r.opens_at, closesAt: r.closes_at, sourcePlanVersionId: r.source_plan_version_id });
const mapNode = (r: NodeRow): StrategyNodeRecord => ({ id: r.id, type: r.type, nameEn: r.name_en, nameAr: r.name_ar, planVersionId: r.plan_version_id, state: r.state, createdBy: r.created_by, createdAt: r.created_at });
const mapEdge = (r: EdgeRow): StrategyEdgeRecord => ({ id: r.id, fromNodeId: r.from_node_id, toNodeId: r.to_node_id, edgeType: r.edge_type, planVersionId: r.plan_version_id });
const mapOwner = (r: OwnerRow): OwnerAssignmentRecord => ({ id: r.id, nodeId: r.node_id, ownerUserId: r.owner_user_id, assignedBy: r.assigned_by, assignedAt: r.assigned_at });
const mapStage = (r: StageRow): StagedChangeRecord => ({ id: r.id, approvalCaseId: r.approval_case_id, planVersionId: r.plan_version_id, kind: r.kind, targetId: r.target_id, payload: r.payload, status: r.status, requestedBy: r.requested_by, requestedAt: r.requested_at, appliedAt: r.applied_at });

export class StrategyService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlanVersion(id: string): Promise<PlanVersionRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<PlanRow[]>(`SELECT * FROM strategy.plan_versions WHERE id=$1::uuid`, id);
    return rows[0] ? mapPlan(rows[0]) : null;
  }

  async createPlanVersion(name: string): Promise<PlanVersionRecord> {
    const rows = await this.prisma.$queryRawUnsafe<PlanRow[]>(`INSERT INTO strategy.plan_versions (id,name,status) VALUES ($1::uuid,$2,'draft') RETURNING *`, randomUUID(), name.trim());
    return mapPlan(rows[0]!);
  }

  async createNode(input: { type: StrategyNodeType; nameEn: string; nameAr: string; planVersionId: string; actorUserId: string; approvalCaseId?: string }): Promise<StrategyNodeRecord | StagedChangeRecord> {
    const plan = await this.requirePlan(input.planVersionId);
    if (plan.status === "active") return this.stage("node_create", null, input.planVersionId, { type: input.type, nameEn: input.nameEn.trim(), nameAr: input.nameAr.trim() }, input.actorUserId, this.requireApproval(input.approvalCaseId));
    this.assertDraft(plan);
    const rows = await this.prisma.$queryRawUnsafe<NodeRow[]>(`INSERT INTO strategy.strategy_nodes (id,type,name_en,name_ar,plan_version_id,state,created_by) VALUES ($1::uuid,$2::strategy."StrategyNodeType",$3,$4,$5::uuid,'draft',$6) RETURNING *`, randomUUID(), input.type, input.nameEn.trim(), input.nameAr.trim(), input.planVersionId, input.actorUserId);
    return mapNode(rows[0]!);
  }

  async updateNode(input: { nodeId: string; nameEn?: string; nameAr?: string; actorUserId: string; approvalCaseId?: string }): Promise<StrategyNodeRecord | StagedChangeRecord> {
    const current = await this.requireNode(input.nodeId); const plan = await this.requirePlan(current.planVersionId);
    const payload = { nameEn: input.nameEn?.trim(), nameAr: input.nameAr?.trim() };
    if (current.state === "active" || plan.status === "active") return this.stage("node_update", current.id, current.planVersionId, payload, input.actorUserId, this.requireApproval(input.approvalCaseId));
    this.assertDraft(plan);
    const rows = await this.prisma.$queryRawUnsafe<NodeRow[]>(`UPDATE strategy.strategy_nodes SET name_en=COALESCE($2,name_en),name_ar=COALESCE($3,name_ar) WHERE id=$1::uuid RETURNING *`, input.nodeId, payload.nameEn ?? null, payload.nameAr ?? null);
    return mapNode(rows[0]!);
  }

  async retireNode(input: { nodeId: string; actorUserId: string; approvalCaseId?: string }): Promise<StrategyNodeRecord | StagedChangeRecord> {
    const current = await this.requireNode(input.nodeId); const plan = await this.requirePlan(current.planVersionId);
    if (current.state === "active" || plan.status === "active") return this.stage("node_retire", current.id, current.planVersionId, {}, input.actorUserId, this.requireApproval(input.approvalCaseId));
    const rows = await this.prisma.$queryRawUnsafe<NodeRow[]>(`UPDATE strategy.strategy_nodes SET state='retired' WHERE id=$1::uuid RETURNING *`, input.nodeId);
    return mapNode(rows[0]!);
  }

  async linkEdge(input: { fromNodeId: string; toNodeId: string; edgeType: StrategyEdgeType; planVersionId: string; actorUserId: string; approvalCaseId?: string }): Promise<StrategyEdgeRecord | StagedChangeRecord> {
    const plan = await this.requirePlan(input.planVersionId); const payload = { fromNodeId: input.fromNodeId, toNodeId: input.toNodeId, edgeType: input.edgeType };
    if (plan.status === "active") return this.stage("edge_link", null, input.planVersionId, payload, input.actorUserId, this.requireApproval(input.approvalCaseId));
    this.assertDraft(plan); return this.insertEdge(payload, input.planVersionId);
  }

  async unlinkEdge(input: { edgeId: string; actorUserId: string; approvalCaseId?: string }): Promise<{ unlinked: true } | StagedChangeRecord> {
    const edge = await this.requireEdge(input.edgeId); const plan = await this.requirePlan(edge.planVersionId);
    if (plan.status === "active") return this.stage("edge_unlink", edge.id, edge.planVersionId, {}, input.actorUserId, this.requireApproval(input.approvalCaseId));
    this.assertDraft(plan); await this.prisma.$executeRawUnsafe(`DELETE FROM strategy.strategy_edges WHERE id=$1::uuid`, edge.id); return { unlinked: true };
  }

  async assignOwner(input: { nodeId: string; ownerUserId: string; assignedBy: string }): Promise<OwnerAssignmentRecord> {
    const node = await this.requireNode(input.nodeId); const plan = await this.requirePlan(node.planVersionId);
    if (plan.status === "closed") throw new Error("Cannot assign an owner in a closed plan version");
    const rows = await this.prisma.$queryRawUnsafe<OwnerRow[]>(`INSERT INTO strategy.owner_assignments (id,node_id,owner_user_id,assigned_by) VALUES ($1::uuid,$2::uuid,$3,$4) ON CONFLICT (node_id,owner_user_id) DO UPDATE SET assigned_by=EXCLUDED.assigned_by,assigned_at=CURRENT_TIMESTAMP RETURNING *`, randomUUID(), input.nodeId, input.ownerUserId, input.assignedBy);
    return mapOwner(rows[0]!);
  }

  async openPlanVersion(planVersionId: string, opensAt = new Date()): Promise<PlanVersionRecord> {
    const plan = await this.requirePlan(planVersionId); this.assertDraft(plan); await this.validateMinimumCardinality(planVersionId);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<PlanRow[]>(`UPDATE strategy.plan_versions SET status='active',opens_at=$2 WHERE id=$1::uuid RETURNING *`, planVersionId, opensAt);
      await tx.$executeRawUnsafe(`UPDATE strategy.strategy_nodes SET state='active' WHERE plan_version_id=$1::uuid AND state='draft'`, planVersionId);
      return mapPlan(rows[0]!);
    });
  }

  async closePlanVersion(planVersionId: string, closesAt = new Date()): Promise<PlanVersionRecord> {
    const plan = await this.requirePlan(planVersionId); if (plan.status !== "active") throw new Error("Only an active plan version can be closed");
    const rows = await this.prisma.$queryRawUnsafe<PlanRow[]>(`UPDATE strategy.plan_versions SET status='closed',closes_at=$2 WHERE id=$1::uuid RETURNING *`, planVersionId, closesAt); return mapPlan(rows[0]!);
  }

  async carryForward(sourcePlanVersionId: string, newName: string, actorUserId: string): Promise<PlanVersionRecord> {
    const source = await this.requirePlan(sourcePlanVersionId); if (source.status === "draft") throw new Error("Carry-forward requires an active or closed source plan");
    return this.prisma.$transaction(async (tx) => {
      const planRows = await tx.$queryRawUnsafe<PlanRow[]>(`INSERT INTO strategy.plan_versions (id,name,status,source_plan_version_id) VALUES ($1::uuid,$2,'draft',$3::uuid) RETURNING *`, randomUUID(), newName.trim(), sourcePlanVersionId);
      const target = mapPlan(planRows[0]!); const sourceNodes = await tx.$queryRawUnsafe<NodeRow[]>(`SELECT * FROM strategy.strategy_nodes WHERE plan_version_id=$1::uuid AND state='active' ORDER BY created_at,id`, sourcePlanVersionId); const ids = new Map<string,string>();
      for (const n of sourceNodes) { const id=randomUUID(); ids.set(n.id,id); await tx.$executeRawUnsafe(`INSERT INTO strategy.strategy_nodes (id,type,name_en,name_ar,plan_version_id,state,created_by) VALUES ($1::uuid,$2::strategy."StrategyNodeType",$3,$4,$5::uuid,'draft',$6)`,id,n.type,n.name_en,n.name_ar,target.id,actorUserId); }
      const edges=await tx.$queryRawUnsafe<EdgeRow[]>(`SELECT * FROM strategy.strategy_edges WHERE plan_version_id=$1::uuid`,sourcePlanVersionId);
      for (const e of edges) { const f=ids.get(e.from_node_id),t=ids.get(e.to_node_id); if(f&&t) await tx.$executeRawUnsafe(`INSERT INTO strategy.strategy_edges (id,from_node_id,to_node_id,edge_type,plan_version_id) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::strategy."StrategyEdgeType",$5::uuid)`,randomUUID(),f,t,e.edge_type,target.id); }
      const owners=await tx.$queryRawUnsafe<OwnerRow[]>(`SELECT o.* FROM strategy.owner_assignments o JOIN strategy.strategy_nodes n ON n.id=o.node_id WHERE n.plan_version_id=$1::uuid AND n.state='active'`,sourcePlanVersionId);
      for(const o of owners){const n=ids.get(o.node_id);if(n) await tx.$executeRawUnsafe(`INSERT INTO strategy.owner_assignments (id,node_id,owner_user_id,assigned_by) VALUES ($1::uuid,$2::uuid,$3,$4)`,randomUUID(),n,o.owner_user_id,actorUserId);}
      return target;
    });
  }

  async applyApprovedChanges(approvalCaseId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const changes=await tx.$queryRawUnsafe<StageRow[]>(`SELECT * FROM strategy.staged_changes WHERE approval_case_id=$1::uuid AND status='pending' ORDER BY requested_at,id FOR UPDATE`,approvalCaseId);
      for(const c of changes){const p=c.payload??{};
        if(c.kind==="node_create") await tx.$executeRawUnsafe(`INSERT INTO strategy.strategy_nodes (id,type,name_en,name_ar,plan_version_id,state,created_by) VALUES ($1::uuid,$2::strategy."StrategyNodeType",$3,$4,$5::uuid,'active',$6)`,randomUUID(),String(p.type),String(p.nameEn),String(p.nameAr),c.plan_version_id,c.requested_by);
        else if(c.kind==="node_update") await tx.$executeRawUnsafe(`UPDATE strategy.strategy_nodes SET name_en=COALESCE($2,name_en),name_ar=COALESCE($3,name_ar) WHERE id=$1::uuid`,c.target_id,typeof p.nameEn==="string"?p.nameEn:null,typeof p.nameAr==="string"?p.nameAr:null);
        else if(c.kind==="node_retire") await tx.$executeRawUnsafe(`UPDATE strategy.strategy_nodes SET state='retired' WHERE id=$1::uuid`,c.target_id);
        else if(c.kind==="edge_link") await tx.$executeRawUnsafe(`INSERT INTO strategy.strategy_edges (id,from_node_id,to_node_id,edge_type,plan_version_id) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::strategy."StrategyEdgeType",$5::uuid)`,randomUUID(),String(p.fromNodeId),String(p.toNodeId),String(p.edgeType),c.plan_version_id);
        else if(c.kind==="edge_unlink") await tx.$executeRawUnsafe(`DELETE FROM strategy.strategy_edges WHERE id=$1::uuid`,c.target_id);
      }
      await tx.$executeRawUnsafe(`UPDATE strategy.staged_changes SET status='applied',applied_at=CURRENT_TIMESTAMP WHERE approval_case_id=$1::uuid AND status='pending'`,approvalCaseId); return changes.length;
    });
  }

  async listActiveNodes(planVersionId:string):Promise<StrategyNodeRecord[]>{const r=await this.prisma.$queryRawUnsafe<NodeRow[]>(`SELECT * FROM strategy.strategy_nodes WHERE plan_version_id=$1::uuid AND state='active' ORDER BY created_at,id`,planVersionId);return r.map(mapNode);}
  async getEdges(planVersionId:string):Promise<StrategyEdgeRecord[]>{const r=await this.prisma.$queryRawUnsafe<EdgeRow[]>(`SELECT * FROM strategy.strategy_edges WHERE plan_version_id=$1::uuid ORDER BY id`,planVersionId);return r.map(mapEdge);}

  private async insertEdge(p:{fromNodeId:string;toNodeId:string;edgeType:StrategyEdgeType},planVersionId:string):Promise<StrategyEdgeRecord>{const r=await this.prisma.$queryRawUnsafe<EdgeRow[]>(`INSERT INTO strategy.strategy_edges (id,from_node_id,to_node_id,edge_type,plan_version_id) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::strategy."StrategyEdgeType",$5::uuid) RETURNING *`,randomUUID(),p.fromNodeId,p.toNodeId,p.edgeType,planVersionId);return mapEdge(r[0]!);}
  private async stage(kind:StagedChangeKind,targetId:string|null,planVersionId:string,payload:Record<string,unknown>,requestedBy:string,approvalCaseId:string):Promise<StagedChangeRecord>{const r=await this.prisma.$queryRawUnsafe<StageRow[]>(`INSERT INTO strategy.staged_changes (id,approval_case_id,plan_version_id,kind,target_id,payload,requested_by) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::strategy."StagedChangeKind",$5::uuid,$6::jsonb,$7) RETURNING *`,randomUUID(),approvalCaseId,planVersionId,kind,targetId,JSON.stringify(payload),requestedBy);return mapStage(r[0]!);}
  private requireApproval(id?:string):string{if(!id)throw new Error("approvalCaseId is required for changes to active strategy data");return id;}
  private assertDraft(p:PlanVersionRecord):void{if(p.status!=="draft")throw new Error("Strategy plan version must be draft");}
  private async requirePlan(id:string):Promise<PlanVersionRecord>{const p=await this.getPlanVersion(id);if(!p)throw new Error("Plan version not found");return p;}
  private async requireNode(id:string):Promise<StrategyNodeRecord>{const r=await this.prisma.$queryRawUnsafe<NodeRow[]>(`SELECT * FROM strategy.strategy_nodes WHERE id=$1::uuid`,id);if(!r[0])throw new Error("Strategy node not found");return mapNode(r[0]);}
  private async requireEdge(id:string):Promise<StrategyEdgeRecord>{const r=await this.prisma.$queryRawUnsafe<EdgeRow[]>(`SELECT * FROM strategy.strategy_edges WHERE id=$1::uuid`,id);if(!r[0])throw new Error("Strategy edge not found");return mapEdge(r[0]);}
  private async validateMinimumCardinality(planVersionId:string):Promise<void>{const r=await this.prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT n.id FROM strategy.strategy_nodes n JOIN strategy.relationship_rules rr ON rr.from_type=n.type LEFT JOIN strategy.strategy_edges e ON e.from_node_id=n.id AND e.edge_type=rr.edge_type LEFT JOIN strategy.strategy_nodes t ON t.id=e.to_node_id AND t.type=rr.to_type WHERE n.plan_version_id=$1::uuid AND n.state<>'retired' GROUP BY n.id,rr.id,rr.min_count HAVING COUNT(t.id)<rr.min_count LIMIT 1`,planVersionId);if(r.length)throw new Error("Strategy plan violates minimum relationship cardinality");}
}

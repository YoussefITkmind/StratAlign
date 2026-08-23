import { createHash, randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import type { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";
import type { GovernanceService } from "../governance/governance.service";
import type { RulesService } from "../rules/rules.service";
import type { StrategyService } from "../strategy/strategy.service";
import { hierarchyDiffSchema, normalizedHierarchySchema, type HierarchyDiff, type NormalizedHierarchy } from "./portfolio-hierarchy.schemas";
import { portfolioErrors } from "./portfolio.errors";

export interface UnmappedPlayView {
  id: string;
  nameEn: string;
  nameAr: string;
  planVersionId: string;
}

export interface PortfolioRagView {
  areaOfFocusId: string;
  period: string;
  status: "on_track" | "watch" | "off_track";
  score: number;
  initiativeCount: number;
  ruleId: string;
}

interface PlayRow {
  id: string;
  name_en: string;
  name_ar: string;
  plan_version_id: string;
}

interface StatusRow {
  initiative_id: string;
  status: "on_track" | "at_risk" | "off_track";
}

type ResolutionMap = Record<string, string>;

export interface PortfolioHierarchyDiffView {
  diffId: string;
  planVersionId: string;
  sourceFormat: "csv" | "json";
  sourceFileName: string | null;
  sourceChecksum: string;
  status: "dry_run" | "submitted" | "applied";
  initialDiff: HierarchyDiff;
  resolutions: ResolutionMap;
  reviewedMappings: Array<HierarchyDiff["mappings"][number] & { selectedPlayId?: string }>;
  readyToCommit: boolean;
  noOp: boolean;
  stagedChangeId: string | null;
  approvalCaseId: string | null;
}

interface ExistingNode { id: string; type: "portfolio" | "area_of_focus" | "strategic_play"; name_en: string; name_ar: string }

const csvColumns = ["portfolio_name_en", "portfolio_name_ar", "aof_name_en", "aof_name_ar", "play_id", "play_name"] as const;
const normalizeName = (value: string) => value.trim().toLocaleLowerCase();

export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly governance?: GovernanceService,
    private readonly strategy?: StrategyService,
  ) {}

  async importHierarchyDryRun(input: { bytes: Buffer; format: "csv" | "json"; planVersionId: string; fileName?: string; actorUserId: string }): Promise<PortfolioHierarchyDiffView> {
    if (input.bytes.length === 0 || input.bytes.length > 10 * 1024 * 1024) throw portfolioErrors.hierarchyImportInvalid("Import file must be between 1 byte and 10 MB");
    await this.requireActivePlan(input.planVersionId);
    const normalized = input.format === "json" ? this.parseJson(input.bytes) : this.parseCsv(input.bytes);
    const diff = await this.buildHierarchyDiff(input.planVersionId, normalized);
    const created = await this.prisma.portfolioHierarchyImport.create({
      data: {
        planVersionId: input.planVersionId,
        sourceFormat: input.format === "csv" ? "CSV" : "JSON",
        sourceFileName: input.fileName?.trim() || null,
        sourceChecksum: createHash("sha256").update(input.bytes).digest("hex"),
        normalizedInput: normalized,
        initialDiff: diff,
        resolutions: {},
        createdBy: input.actorUserId,
      },
    });
    return this.toHierarchyDiffView(created);
  }

  async getHierarchyDiff(diffId: string): Promise<PortfolioHierarchyDiffView> {
    const record = await this.prisma.portfolioHierarchyImport.findUnique({ where: { id: diffId } });
    if (!record) throw portfolioErrors.hierarchyImportNotFound();
    return this.toHierarchyDiffView(record, await this.reviewedPayload(record));
  }

  async resolveHierarchyMatch(input: { diffId: string; mappingId: string; playId: string }): Promise<PortfolioHierarchyDiffView> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM strategy.portfolio_hierarchy_imports
        WHERE id=${input.diffId}::uuid FOR UPDATE
      `;
      if (!locked[0]) throw portfolioErrors.hierarchyImportNotFound();
      const record = await tx.portfolioHierarchyImport.findUnique({ where: { id: input.diffId } });
      if (!record) throw portfolioErrors.hierarchyImportNotFound();
      if (record.status !== "DRY_RUN" || record.approvalCaseId || record.stagedChangeId) throw portfolioErrors.hierarchyImportNotReady("Only an unfrozen dry-run import can be resolved");
      const diff = hierarchyDiffSchema.parse(record.initialDiff);
      if (!diff.mappings.some((mapping) => mapping.mappingId === input.mappingId)) throw portfolioErrors.hierarchyImportInvalid("Mapping was not found in this import");
      const play = await tx.strategyNode.findFirst({ where: { id: input.playId, type: "STRATEGIC_PLAY", state: "ACTIVE", planVersionId: record.planVersionId } });
      if (!play) throw portfolioErrors.hierarchyImportInvalid("Selected play is not active in the import plan version");
      const resolutions = { ...(record.resolutions as ResolutionMap), [input.mappingId]: play.id };
      return tx.portfolioHierarchyImport.update({ where: { id: record.id }, data: { resolutions } });
    });
    return this.toHierarchyDiffView(updated, await this.reviewedPayload(updated));
  }

  async commitHierarchyImport(input: { diffId: string; approvalParticipantId: string; actorUserId: string }) {
    if (!this.governance || !this.strategy) throw new Error("Portfolio hierarchy governance services unavailable");
    const governance = this.governance;
    const strategy = this.strategy;
    const record = await this.prisma.portfolioHierarchyImport.findUnique({ where: { id: input.diffId } });
    if (!record) throw portfolioErrors.hierarchyImportNotFound();
    const workflow = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM strategy.portfolio_hierarchy_imports
        WHERE id=${record.id}::uuid FOR UPDATE
      `;
      if (!locked[0]) throw portfolioErrors.hierarchyImportNotFound();
      const current = await tx.portfolioHierarchyImport.findUnique({ where: { id: record.id } });
      if (!current) throw portfolioErrors.hierarchyImportNotFound();
      if (current.approvalCaseId && current.stagedChangeId) {
        return { approvalCaseId: current.approvalCaseId, stagedChangeId: current.stagedChangeId };
      }
      if (current.stagedChangeId && !current.approvalCaseId) {
        throw portfolioErrors.hierarchyImportNotReady("Import has a staged change without a Governance case");
      }
      if (current.status !== "DRY_RUN") throw portfolioErrors.hierarchyImportNotReady("Import workflow cannot be created from its current state");
      const plan = await tx.planVersion.findUnique({ where: { id: current.planVersionId } });
      if (!plan || plan.status !== "ACTIVE") throw portfolioErrors.hierarchyImportInvalid("Selected plan version must exist and be active");
      const reviewedPayload = await this.reviewedPayload(current, tx);
      if (reviewedPayload.unresolved > 0) throw portfolioErrors.hierarchyImportNotReady("All fuzzy and unresolved play mappings require manual resolution");
      if (reviewedPayload.conflicts.length > 0) throw portfolioErrors.hierarchyImportNotReady(reviewedPayload.conflicts.join("; "));
      if (reviewedPayload.nodes.length === 0 && reviewedPayload.edges.length === 0) throw portfolioErrors.hierarchyImportNotReady("The reviewed import is a no-op");

      let approvalCaseId: string;
      let stagedChangeId: string;
      if (current.approvalCaseId) {
        const approvalCase = await tx.approvalCase.findUnique({ where: { id: current.approvalCaseId } });
        if (!approvalCase || approvalCase.currentState !== "DRAFT" || approvalCase.entityType !== "StrategyStagedChange") throw portfolioErrors.hierarchyImportNotReady("Existing import workflow cannot be resumed safely");
        approvalCaseId = approvalCase.id;
        stagedChangeId = approvalCase.entityId;
      } else {
        stagedChangeId = randomUUID();
        const approvalCase = await governance.createCaseInTransaction(tx, {
          entityType: "StrategyStagedChange",
          entityId: stagedChangeId,
          submittedBy: input.actorUserId,
          approvalParticipantId: input.approvalParticipantId,
          proposedChange: {
            before: null,
            after: { diffId: current.id, nodes: reviewedPayload.nodes, edges: reviewedPayload.edges },
            impactSummary: { portfoliosAndAreasAdded: reviewedPayload.nodes.length, relationshipsAdded: reviewedPayload.edges.length },
          },
        });
        approvalCaseId = approvalCase.id;
      }
      await strategy.stageHierarchyImportInTransaction(tx, { stagedChangeId, approvalCaseId, planVersionId: current.planVersionId, diffId: current.id, nodes: reviewedPayload.nodes, edges: reviewedPayload.edges, actorUserId: input.actorUserId });
      await tx.portfolioHierarchyImport.update({ where: { id: current.id }, data: { approvalCaseId, stagedChangeId } });
      return { approvalCaseId, stagedChangeId };
    });

    const approvalCase = await governance.getCase(workflow.approvalCaseId);
    let governanceState = approvalCase.currentState;
    if (governanceState === "DRAFT") {
      try {
        governanceState = (await governance.transition({ caseId: approvalCase.id, event: { type: "SUBMIT", actorUserId: input.actorUserId } })).currentState;
      } catch (error) {
        const current = await governance.getCase(workflow.approvalCaseId);
        if (current.currentState === "DRAFT") throw error;
        governanceState = current.currentState;
      }
    }
    await this.prisma.$executeRaw`
      UPDATE strategy.portfolio_hierarchy_imports
      SET status='submitted',submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP)
      WHERE id=${record.id}::uuid AND status='dry_run'
    `;
    return { diffId: record.id, stagedChangeId: workflow.stagedChangeId, approvalCaseId: workflow.approvalCaseId, governanceState: governanceState.toLowerCase() };
  }

  async findUnmappedPlays(): Promise<UnmappedPlayView[]> {
    const rows = await this.prisma.$queryRaw<PlayRow[]>`
      SELECT p.id, p.name_en, p.name_ar, p.plan_version_id
      FROM strategy.strategy_nodes p
      WHERE p.type = 'strategic_play'
        AND p.state = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM strategy.strategy_edges e
          JOIN strategy.strategy_nodes aof ON aof.id = e.to_node_id
          WHERE e.from_node_id = p.id
            AND e.edge_type = 'belongs_to_portfolio'
            AND e.plan_version_id = p.plan_version_id
            AND aof.type = 'area_of_focus'
            AND aof.state = 'active'
        )
      ORDER BY p.name_en, p.id
    `;

    return rows.map((row) => ({
      id: row.id,
      nameEn: row.name_en,
      nameAr: row.name_ar,
      planVersionId: row.plan_version_id,
    }));
  }

  async computeRag(areaOfFocusId: string, period: string): Promise<PortfolioRagView> {
    const [aof] = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM strategy.strategy_nodes
      WHERE id = ${areaOfFocusId}::uuid
        AND type = 'area_of_focus'
        AND state = 'active'
    `;
    if (!aof) throw portfolioErrors.areaOfFocusNotFound();

    const statuses = await this.prisma.$queryRaw<StatusRow[]>`
      SELECT DISTINCT ON (su.initiative_id)
        su.initiative_id,
        su.status::text AS status
      FROM execution.status_updates su
      JOIN execution.initiatives i ON i.id = su.initiative_id
      JOIN strategy.strategy_edges e
        ON e.from_node_id = i.strategic_play_node_id
       AND e.to_node_id = ${areaOfFocusId}::uuid
       AND e.edge_type = 'belongs_to_portfolio'
      WHERE su.period = ${period}
      ORDER BY su.initiative_id, su.created_at DESC, su.id DESC
    `;

    if (statuses.length === 0) throw portfolioErrors.noInitiativeStatuses();

    const rule = await this.rules.getPublished("portfolio-rag");
    if (!rule || rule.ruleType !== "rag_aggregation") {
      throw portfolioErrors.ragRuleNotFound();
    }

    const result = await this.rules.evaluate(rule.id, {
      children: statuses.map((row) => ({
        id: row.initiative_id,
        status: row.status === "at_risk" ? "watch" : row.status,
      })),
    });

    if (
      !("status" in result) ||
      !("score" in result) ||
      typeof result.score !== "number" ||
      (result.status !== "on_track" && result.status !== "watch" && result.status !== "off_track")
    ) {
      throw portfolioErrors.ragRuleNotFound();
    }

    return {
      areaOfFocusId,
      period,
      status: result.status,
      score: result.score,
      initiativeCount: statuses.length,
      ruleId: rule.id,
    };
  }

  private parseJson(bytes: Buffer): NormalizedHierarchy {
    try {
      return normalizedHierarchySchema.parse(JSON.parse(bytes.toString("utf8")));
    } catch (error) {
      throw portfolioErrors.hierarchyImportInvalid(`Invalid hierarchy JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parseCsv(bytes: Buffer): NormalizedHierarchy {
    try {
      const workbook = XLSX.read(bytes, { type: "buffer", raw: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("CSV is empty");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
      const headers = (matrix[0] ?? []).map((value) => String(value).trim());
      if (headers.length !== csvColumns.length || new Set(headers).size !== csvColumns.length || csvColumns.some((column) => !headers.includes(column))) {
        throw new Error(`CSV columns must be exactly: ${csvColumns.join(", ")}`);
      }
      if (matrix.length < 2) throw new Error("CSV hierarchy is empty");
      const portfolios = new Map<string, { nameEn: string; nameAr: string; areas: Map<string, { nameEn: string; nameAr: string; plays: Array<{ id?: string; name?: string }> }> }>();
      for (const [index, values] of matrix.slice(1).entries()) {
        const row = Object.fromEntries(csvColumns.map((column) => [column, String(values[headers.indexOf(column)] ?? "").trim()])) as Record<(typeof csvColumns)[number], string>;
        if (Object.values(row).every((value) => value === "")) throw new Error(`CSV row ${index + 2} is empty`);
        if (!row.portfolio_name_en || !row.portfolio_name_ar || !row.aof_name_en || !row.aof_name_ar) throw new Error(`CSV row ${index + 2} requires bilingual Portfolio and Area of Focus names`);
        if ((row.play_id || row.play_name) && row.play_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.play_id)) throw new Error(`CSV row ${index + 2} has an invalid play_id`);
        const portfolioKey = `${normalizeName(row.portfolio_name_en)}\u0000${normalizeName(row.portfolio_name_ar)}`;
        let portfolio = portfolios.get(portfolioKey);
        if (!portfolio) {
          portfolio = { nameEn: row.portfolio_name_en, nameAr: row.portfolio_name_ar, areas: new Map() };
          portfolios.set(portfolioKey, portfolio);
        }
        const areaKey = `${normalizeName(row.aof_name_en)}\u0000${normalizeName(row.aof_name_ar)}`;
        let area = portfolio.areas.get(areaKey);
        if (!area) {
          area = { nameEn: row.aof_name_en, nameAr: row.aof_name_ar, plays: [] };
          portfolio.areas.set(areaKey, area);
        }
        if (row.play_id || row.play_name) area.plays.push({ ...(row.play_id ? { id: row.play_id } : {}), ...(row.play_name ? { name: row.play_name } : {}) });
      }
      return normalizedHierarchySchema.parse({ portfolios: [...portfolios.values()].map((portfolio) => ({ nameEn: portfolio.nameEn, nameAr: portfolio.nameAr, areasOfFocus: [...portfolio.areas.values()] })) });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid hierarchy CSV:")) throw error;
      throw portfolioErrors.hierarchyImportInvalid(`Invalid hierarchy CSV: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async buildHierarchyDiff(planVersionId: string, normalized: NormalizedHierarchy): Promise<HierarchyDiff> {
    const existing = await this.prisma.$queryRaw<ExistingNode[]>`
      SELECT id,type::text,name_en,name_ar FROM strategy.strategy_nodes
      WHERE plan_version_id=${planVersionId}::uuid AND state='active'
        AND type IN ('portfolio','area_of_focus','strategic_play')
    `;
    const existingEdges = await this.prisma.strategyEdge.findMany({ where: { planVersionId } });
    const nodes: HierarchyDiff["nodes"] = [];
    const edges: HierarchyDiff["edges"] = [];
    const mappings: HierarchyDiff["mappings"] = [];
    const conflicts: string[] = [];
    const plannedNodes = new Map<string, string>();
    const plannedEdges = new Set<string>();
    const mappedInFile = new Map<string, string>();
    const seenReferences = new Set<string>();

    const nodeId = (type: "portfolio" | "area_of_focus", nameEn: string, nameAr: string): string => {
      const matches = existing.filter((node) => node.type === type && normalizeName(node.name_en) === normalizeName(nameEn) && normalizeName(node.name_ar) === normalizeName(nameAr));
      if (matches.length > 1) {
        conflicts.push(`Ambiguous existing ${type} match for ${nameEn}`);
        return matches[0]!.id;
      }
      if (matches[0]) return matches[0].id;
      const key = `${type}:${normalizeName(nameEn)}:${normalizeName(nameAr)}`;
      const reused = plannedNodes.get(key);
      if (reused) return reused;
      const id = randomUUID();
      plannedNodes.set(key, id);
      nodes.push({ id, type, nameEn, nameAr });
      return id;
    };
    const addEdge = (id: string, fromNodeId: string, toNodeId: string, edgeType: "contains" | "belongs_to_portfolio") => {
      const key = `${fromNodeId}:${toNodeId}:${edgeType}`;
      if (plannedEdges.has(key) || existingEdges.some((edge) => edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId && edge.edgeType.toLowerCase() === edgeType)) return;
      plannedEdges.add(key);
      edges.push({ id, fromNodeId, toNodeId, edgeType });
    };

    for (const portfolio of normalized.portfolios) {
      const portfolioId = nodeId("portfolio", portfolio.nameEn, portfolio.nameAr);
      for (const area of portfolio.areasOfFocus) {
        const areaId = nodeId("area_of_focus", area.nameEn, area.nameAr);
        const otherParent = existingEdges.find((edge) => edge.toNodeId === areaId && edge.edgeType === "CONTAINS" && edge.fromNodeId !== portfolioId);
        if (otherParent) conflicts.push(`Area of Focus ${area.nameEn} already belongs to a different Portfolio`);
        addEdge(randomUUID(), portfolioId, areaId, "contains");
        for (const reference of area.plays) {
          const mappingId = randomUUID();
          const edgeId = randomUUID();
          let resolution: HierarchyDiff["mappings"][number]["resolution"] = "unresolved";
          let resolvedPlayId: string | undefined;
          if (reference.id) {
            const byId = existing.find((node) => node.type === "strategic_play" && node.id === reference.id);
            if (byId) { resolution = "exact_id"; resolvedPlayId = byId.id; }
          }
          if (!resolvedPlayId && reference.name) {
            const exact = existing.filter((node) => node.type === "strategic_play" && (normalizeName(node.name_en) === normalizeName(reference.name!) || normalizeName(node.name_ar) === normalizeName(reference.name!)));
            if (exact.length === 1) { resolution = "exact_name"; resolvedPlayId = exact[0]!.id; }
          }
          const candidates = resolvedPlayId || !reference.name ? [] : await this.prisma.$queryRaw<Array<{ id: string; name_en: string; name_ar: string; similarity: number }>>`
            SELECT id,name_en,name_ar,GREATEST(similarity(name_en,${reference.name}),similarity(name_ar,${reference.name}))::float8 AS similarity
            FROM strategy.strategy_nodes
            WHERE plan_version_id=${planVersionId}::uuid AND type='strategic_play' AND state='active'
              AND GREATEST(similarity(name_en,${reference.name}),similarity(name_ar,${reference.name})) >= 0.3
            ORDER BY similarity DESC,id ASC LIMIT 10
          `;
          if (!resolvedPlayId && candidates.length > 0) resolution = "fuzzy";
          let conflict: string | undefined;
          const referenceKey = `${areaId}:${reference.id ?? ""}:${normalizeName(reference.name ?? "")}`;
          if (seenReferences.has(referenceKey)) conflict = "Duplicate play mapping appears within the import";
          seenReferences.add(referenceKey);
          if (resolvedPlayId) {
            const current = existingEdges.find((edge) => edge.fromNodeId === resolvedPlayId && edge.edgeType === "BELONGS_TO_PORTFOLIO" && edge.toNodeId !== areaId);
            const requestedArea = mappedInFile.get(resolvedPlayId);
            if (current) conflict = "Play is already mapped to a different Area of Focus";
            else if (requestedArea && requestedArea !== areaId) conflict = "Play is mapped to conflicting Areas of Focus within the import";
            mappedInFile.set(resolvedPlayId, areaId);
            addEdge(edgeId, resolvedPlayId, areaId, "belongs_to_portfolio");
          }
          mappings.push({ mappingId, edgeId, areaOfFocusId: areaId, ...(reference.id ? { suppliedPlayId: reference.id } : {}), ...(reference.name ? { suppliedPlayName: reference.name } : {}), resolution, ...(resolvedPlayId ? { resolvedPlayId } : {}), candidates: candidates.map((candidate) => ({ id: candidate.id, nameEn: candidate.name_en, nameAr: candidate.name_ar, similarity: candidate.similarity })), ...(conflict ? { conflict } : {}) });
        }
      }
    }
    return hierarchyDiffSchema.parse({ nodes, edges, mappings, conflicts });
  }

  private async reviewedPayload(
    record: { planVersionId: string; initialDiff: unknown; resolutions: unknown },
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const diff = hierarchyDiffSchema.parse(record.initialDiff);
    const resolutions = (record.resolutions ?? {}) as ResolutionMap;
    const conflicts = [...diff.conflicts, ...diff.mappings.flatMap((mapping) => mapping.conflict ? [mapping.conflict] : [])];
    let unresolved = 0;
    const edges = diff.edges.filter((edge) => edge.edgeType === "contains");
    const edgeKeys = new Set(edges.map((edge) => `${edge.fromNodeId}:${edge.toNodeId}:${edge.edgeType}`));
    const reviewedAreas = new Map<string, string>();
    for (const mapping of diff.mappings) {
      const playId = resolutions[mapping.mappingId] ?? mapping.resolvedPlayId;
      if (!playId) { unresolved += 1; continue; }
      const play = await client.strategyNode.findFirst({ where: { id: playId, planVersionId: record.planVersionId, type: "STRATEGIC_PLAY", state: "ACTIVE" } });
      if (!play) { conflicts.push(`Resolved play ${playId} is no longer active in the selected plan`); continue; }
      const reviewedArea = reviewedAreas.get(playId);
      if (reviewedArea && reviewedArea !== mapping.areaOfFocusId) {
        conflicts.push(`Resolved play ${playId} is mapped to conflicting Areas of Focus in the reviewed import`);
        continue;
      }
      reviewedAreas.set(playId, mapping.areaOfFocusId);
      const other = await client.strategyEdge.findFirst({ where: { planVersionId: record.planVersionId, fromNodeId: playId, edgeType: "BELONGS_TO_PORTFOLIO", NOT: { toNodeId: mapping.areaOfFocusId } } });
      if (other) { conflicts.push(`Resolved play ${playId} is already mapped to another Area of Focus`); continue; }
      const key = `${playId}:${mapping.areaOfFocusId}:belongs_to_portfolio`;
      if (!edgeKeys.has(key)) { edgeKeys.add(key); edges.push({ id: mapping.edgeId, fromNodeId: playId, toNodeId: mapping.areaOfFocusId, edgeType: "belongs_to_portfolio" }); }
    }
    const newNodeIds = new Set(diff.nodes.map((node) => node.id));
    for (const edge of edges.filter((candidate) => candidate.edgeType === "contains")) {
      if (!newNodeIds.has(edge.fromNodeId)) {
        const portfolio = await client.strategyNode.findFirst({ where: { id: edge.fromNodeId, planVersionId: record.planVersionId, type: "PORTFOLIO", state: "ACTIVE" } });
        if (!portfolio) conflicts.push(`Portfolio ${edge.fromNodeId} is no longer active in the selected plan`);
      }
      if (!newNodeIds.has(edge.toNodeId)) {
        const area = await client.strategyNode.findFirst({ where: { id: edge.toNodeId, planVersionId: record.planVersionId, type: "AREA_OF_FOCUS", state: "ACTIVE" } });
        if (!area) {
          conflicts.push(`Area of Focus ${edge.toNodeId} is no longer active in the selected plan`);
          continue;
        }
        const otherParent = await client.strategyEdge.findFirst({ where: { planVersionId: record.planVersionId, toNodeId: edge.toNodeId, edgeType: "CONTAINS", NOT: { fromNodeId: edge.fromNodeId } } });
        if (otherParent) conflicts.push(`Area of Focus ${edge.toNodeId} already belongs to a different Portfolio`);
      }
    }
    const finalEdges = [] as HierarchyDiff["edges"];
    for (const edge of edges) {
      const exists = await client.strategyEdge.findFirst({ where: { planVersionId: record.planVersionId, fromNodeId: edge.fromNodeId, toNodeId: edge.toNodeId, edgeType: edge.edgeType === "contains" ? "CONTAINS" : "BELONGS_TO_PORTFOLIO" } });
      if (!exists) finalEdges.push(edge);
    }
    for (const node of diff.nodes) {
      const duplicate = await client.strategyNode.findFirst({ where: { planVersionId: record.planVersionId, state: "ACTIVE", type: node.type === "portfolio" ? "PORTFOLIO" : "AREA_OF_FOCUS", nameEn: { equals: node.nameEn, mode: "insensitive" }, nameAr: { equals: node.nameAr, mode: "insensitive" } } });
      if (duplicate) conflicts.push(`A matching ${node.type} named ${node.nameEn} was created after the dry run`);
    }
    return { nodes: diff.nodes, edges: finalEdges, unresolved, conflicts: [...new Set(conflicts)] };
  }

  private toHierarchyDiffView(record: { id: string; planVersionId: string; sourceFormat: "CSV" | "JSON"; sourceFileName: string | null; sourceChecksum: string; status: "DRY_RUN" | "SUBMITTED" | "APPLIED"; initialDiff: unknown; resolutions: unknown; stagedChangeId: string | null; approvalCaseId: string | null }, review?: Awaited<ReturnType<PortfolioService["reviewedPayload"]>>): PortfolioHierarchyDiffView {
    const initialDiff = hierarchyDiffSchema.parse(record.initialDiff);
    const resolutions = (record.resolutions ?? {}) as ResolutionMap;
    const reviewedMappings = initialDiff.mappings.map((mapping) => ({ ...mapping, ...(resolutions[mapping.mappingId] ? { selectedPlayId: resolutions[mapping.mappingId] } : mapping.resolvedPlayId ? { selectedPlayId: mapping.resolvedPlayId } : {}) }));
    const unresolved = review ? review.unresolved > 0 : reviewedMappings.some((mapping) => !mapping.selectedPlayId);
    const hasConflicts = review ? review.conflicts.length > 0 : initialDiff.conflicts.length > 0 || initialDiff.mappings.some((mapping) => mapping.conflict);
    const manualEdges = reviewedMappings.filter((mapping) => mapping.selectedPlayId && !mapping.resolvedPlayId).length;
    const noOp = review ? review.nodes.length + review.edges.length === 0 : initialDiff.nodes.length + initialDiff.edges.length + manualEdges === 0;
    return { diffId: record.id, planVersionId: record.planVersionId, sourceFormat: record.sourceFormat.toLowerCase() as "csv" | "json", sourceFileName: record.sourceFileName, sourceChecksum: record.sourceChecksum, status: record.status.toLowerCase() as PortfolioHierarchyDiffView["status"], initialDiff, resolutions, reviewedMappings, readyToCommit: record.status === "DRY_RUN" && record.approvalCaseId === null && record.stagedChangeId === null && !unresolved && !hasConflicts && !noOp, noOp, stagedChangeId: record.stagedChangeId, approvalCaseId: record.approvalCaseId };
  }

  private async requireActivePlan(planVersionId: string): Promise<void> {
    const plan = await this.prisma.planVersion.findUnique({ where: { id: planVersionId } });
    if (!plan || plan.status !== "ACTIVE") throw portfolioErrors.hierarchyImportInvalid("Selected plan version must exist and be active");
  }
}

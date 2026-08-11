import type { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../database/prisma.service";

import type { ApprovalGateway } from "./gateways/approval.gateway";
import type { StrategyNodeGateway } from "./gateways/strategy-node.gateway";
import {
  RegistryApprovalError,
  RegistryOperationError,
} from "./registry.errors";
import {
  fromKpiDataSourceTypeView,
  fromKpiFrequencyView,
  fromKpiPolarityView,
  toAlignmentTypeView,
  toKpiDataSourceTypeView,
  toKpiFrequencyView,
  toKpiPolarityView,
  toKpiStatusView,
} from "./registry.mappers";
import type {
  KpiDataSourceTypeView,
  KpiDefinitionView,
  KpiFrequencyView,
  KpiPolarityView,
  KpiSimilarityMatch,
  KpiThresholdRuleBindingView,
  KpiVersionView,
  KpiWithVersionView,
  RetirementImpactView,
  SimilarityMatchField,
} from "./registry.types";

export interface CreateKpiDraftInput {
  /** Omit to open the first version of a brand new KPI. */
  kpiDefinitionId?: string;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  unit: string;
  polarity: KpiPolarityView;
  frequency: KpiFrequencyView;
  dataSourceType: KpiDataSourceTypeView;
  calculationLogicText?: string | null;
  ownerUserId: string;
  stewardUserId?: string | null;
  activeFrom: Date;
}

export interface PublishKpiVersionInput {
  kpiVersionId: string;
  /** Workflow case authorising publication. Never optional. */
  approvalCaseId: string;
}

export interface FindSimilarKpisInput {
  text: string;
  /** Trigram floor, 0-1. Below this a candidate is not a match. */
  threshold?: number;
  limit?: number;
  /** Excluded from results, so an edit does not match itself. */
  excludeKpiDefinitionId?: string;
}

export interface BindThresholdRuleInput {
  kpiVersionId: string;
  thresholdRuleId: string;
  actorUserId: string;
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.3;
const DEFAULT_SIMILARITY_LIMIT = 10;

/**
 * Raw shape returned by the trigram query. Prisma cannot express
 * `similarity()` through the query builder, so this one read is raw SQL.
 */
interface SimilarityRow {
  kpi_definition_id: string;
  kpi_version_id: string;
  version: number;
  status: string;
  name_en: string;
  name_ar: string;
  score_name_en: number;
  score_name_ar: number;
  score_description_en: number;
  score_description_ar: number;
  similarity: number;
}

/**
 * KPI definitions and their append-only version history.
 *
 * Versioning follows the linked-list pattern `RuleDefinition` established:
 * a stable definition row, numbered versions, and a `supersedes` chain. The
 * difference is that identity and content are split across two tables, so a
 * KPI keeps one id forever while its specification evolves.
 *
 * Version rows are never rewritten. The database enforces this with a trigger
 * (see the registry migration); publication only stamps the write-once
 * transition columns. Retirement moves the definition's status and leaves
 * every version queryable.
 */
export class KpiRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalGateway,
    private readonly strategyNodes: StrategyNodeGateway,
  ) {}

  /**
   * Opens a new draft version.
   *
   * For a new KPI this also creates the definition. For an existing one it
   * appends the next version number; the partial unique index rejects a second
   * concurrent open draft, and the advisory lock serialises version allocation
   * exactly as `SnapshotService.writeSnapshot` does.
   */
  async createDraft(
    input: CreateKpiDraftInput,
  ): Promise<KpiWithVersionView> {
    const nameEn = input.nameEn.trim();
    const nameAr = input.nameAr.trim();
    const unit = input.unit.trim();

    if (!nameEn || !nameAr) {
      throw new RegistryOperationError(
        "English and Arabic names are both required",
      );
    }

    if (!unit) {
      throw new RegistryOperationError("A unit is required");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const definition = input.kpiDefinitionId
          ? await this.lockExistingDefinition(tx, input.kpiDefinitionId)
          : await tx.kpiDefinition.create({ data: {} });

        if (definition.status === "RETIRED") {
          throw new RegistryOperationError(
            "A retired KPI cannot receive new versions",
          );
        }

        const latest = await tx.kpiVersion.findFirst({
          where: { kpiDefinitionId: definition.id },
          orderBy: { version: "desc" },
          select: { version: true, publishedAt: true },
        });

        if (latest && latest.publishedAt === null) {
          throw new RegistryOperationError(
            "An open draft already exists for this KPI",
          );
        }

        const version = await tx.kpiVersion.create({
          data: {
            kpiDefinitionId: definition.id,
            version: (latest?.version ?? 0) + 1,
            nameEn,
            nameAr,
            descriptionEn: input.descriptionEn?.trim() || null,
            descriptionAr: input.descriptionAr?.trim() || null,
            unit,
            polarity: fromKpiPolarityView(input.polarity),
            frequency: fromKpiFrequencyView(input.frequency),
            dataSourceType: fromKpiDataSourceTypeView(input.dataSourceType),
            calculationLogicText:
              input.calculationLogicText?.trim() || null,
            ownerUserId: input.ownerUserId,
            stewardUserId: input.stewardUserId ?? null,
            activeFrom: input.activeFrom,
          },
        });

        return {
          definition: this.toDefinitionView(definition),
          version: this.toVersionView(version),
        };
      });
    } catch (error) {
      throw this.rethrow(error);
    }
  }

  /**
   * Publishes a drafted version once the workflow module confirms approval.
   *
   * The approval check runs before the transaction opens: it is a call into
   * another module and must not hold registry row locks while it waits. A
   * refusal propagates untouched — there is no path through this method that
   * publishes without `assertApproved` having resolved.
   */
  async publishVersion(
    input: PublishKpiVersionInput,
  ): Promise<KpiWithVersionView> {
    const approvalCaseId = input.approvalCaseId.trim();

    if (!approvalCaseId) {
      throw new RegistryApprovalError(
        "An approval case id is required to publish",
      );
    }

    const draft = await this.prisma.kpiVersion.findUnique({
      where: { id: input.kpiVersionId },
      select: {
        id: true,
        kpiDefinitionId: true,
        publishedAt: true,
        activeFrom: true,
      },
    });

    if (!draft) {
      throw new RegistryOperationError("KPI version was not found");
    }

    if (draft.publishedAt !== null) {
      throw new RegistryOperationError(
        "This version has already been published",
      );
    }

    await this.approvals.assertApproved({
      approvalCaseId,
      subjectType: "KpiDefinition",
      subjectId: draft.kpiDefinitionId,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const definition = await this.lockExistingDefinition(
          tx,
          draft.kpiDefinitionId,
        );

        if (definition.status === "RETIRED") {
          throw new RegistryOperationError(
            "A retired KPI cannot publish new versions",
          );
        }

        // Re-read under the lock: a concurrent publish may have landed
        // between the pre-flight check and this transaction.
        const current = await tx.kpiVersion.findUniqueOrThrow({
          where: { id: draft.id },
          select: { publishedAt: true },
        });

        if (current.publishedAt !== null) {
          throw new RegistryOperationError(
            "This version has already been published",
          );
        }

        const published = await tx.kpiVersion.update({
          where: { id: draft.id },
          data: {
            publishedAt: new Date(),
            approvalCaseId,
            // Recorded at publication rather than drafting, because a version
            // supersedes whatever was live when it went live.
            supersedesVersionId: definition.activeVersionId,
          },
        });

        const updatedDefinition = await tx.kpiDefinition.update({
          where: { id: definition.id },
          data: {
            activeVersionId: published.id,
            status: "ACTIVE",
          },
        });

        return {
          definition: this.toDefinitionView(updatedDefinition),
          version: this.toVersionView(published),
        };
      });
    } catch (error) {
      throw this.rethrow(error);
    }
  }

  /**
   * Retires a KPI.
   *
   * Deletes nothing: the definition keeps its active version pointer and every
   * version stays queryable, so historical reporting over retired KPIs remains
   * correct. Alignments and hierarchy edges are left intact — callers preview
   * them with `retirementImpact` first.
   */
  async retire(kpiDefinitionId: string): Promise<KpiDefinitionView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const definition = await this.lockExistingDefinition(
          tx,
          kpiDefinitionId,
        );

        if (definition.status === "RETIRED") {
          throw new RegistryOperationError("This KPI is already retired");
        }

        const retired = await tx.kpiDefinition.update({
          where: { id: definition.id },
          data: { status: "RETIRED", retiredAt: new Date() },
        });

        return this.toDefinitionView(retired);
      });
    } catch (error) {
      throw this.rethrow(error);
    }
  }

  /**
   * Trigram duplicate detection across both languages.
   *
   * Scoring, ranking and thresholding are all done by PostgreSQL via pg_trgm;
   * nothing is compared in application code. The GIN indexes created in the
   * registry migration back the `%` operator, which is applied first so the
   * index can eliminate candidates before `similarity()` scores them.
   *
   * Only the newest version of each KPI is considered — superseded wording
   * would otherwise resurface a KPI repeatedly.
   */
  async findSimilar(
    input: FindSimilarKpisInput,
  ): Promise<KpiSimilarityMatch[]> {
    const text = input.text.trim();

    if (!text) {
      return [];
    }

    const threshold = input.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
    const limit = input.limit ?? DEFAULT_SIMILARITY_LIMIT;
    const excluded = input.excludeKpiDefinitionId ?? null;

    const rows = await this.prisma.$queryRaw<SimilarityRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (v."kpi_definition_id")
          v."id",
          v."kpi_definition_id",
          v."version",
          v."name_en",
          v."name_ar",
          v."description_en",
          v."description_ar"
        FROM "registry"."kpi_versions" v
        ORDER BY v."kpi_definition_id", v."version" DESC
      ),
      scored AS (
        SELECT
          latest."kpi_definition_id",
          latest."id" AS kpi_version_id,
          latest."version",
          d."status"::text AS status,
          latest."name_en",
          latest."name_ar",
          similarity(latest."name_en", ${text})                       AS score_name_en,
          similarity(latest."name_ar", ${text})                       AS score_name_ar,
          similarity(COALESCE(latest."description_en", ''), ${text})  AS score_description_en,
          similarity(COALESCE(latest."description_ar", ''), ${text})  AS score_description_ar
        FROM latest
        JOIN "registry"."kpi_definitions" d
          ON d."id" = latest."kpi_definition_id"
        WHERE (${excluded}::text IS NULL OR latest."kpi_definition_id" <> ${excluded}::text)
          AND (
            latest."name_en" % ${text}
            OR latest."name_ar" % ${text}
            OR latest."description_en" % ${text}
            OR latest."description_ar" % ${text}
          )
      )
      SELECT
        scored.*,
        GREATEST(
          score_name_en,
          score_name_ar,
          score_description_en,
          score_description_ar
        ) AS similarity
      FROM scored
      WHERE GREATEST(
        score_name_en,
        score_name_ar,
        score_description_en,
        score_description_ar
      ) >= ${threshold}::real
      ORDER BY similarity DESC, scored."kpi_definition_id"
      LIMIT ${limit}
    `;

    return rows.map((row, index) => ({
      kpiDefinitionId: row.kpi_definition_id,
      kpiVersionId: row.kpi_version_id,
      version: row.version,
      status: this.parseStatus(row.status),
      nameEn: row.name_en,
      nameAr: row.name_ar,
      similarity: row.similarity,
      rank: index + 1,
      matchingFields: this.collectMatchingFields(row, threshold),
    }));
  }

  /**
   * Previews what retiring a KPI would strand.
   *
   * Reports alignment ids and the strategy node ids they record. Registry
   * uses the configured Strategy gateway to report whether those references
   * can be verified without taking ownership of Strategy data.
   * TODO(Phase 3): extend with scorecards and dashboards that consume this
   * KPI, which do not exist yet.
   */
  async retirementImpact(
    kpiDefinitionId: string,
  ): Promise<RetirementImpactView> {
    const definition = await this.prisma.kpiDefinition.findUnique({
      where: { id: kpiDefinitionId },
      select: { id: true, status: true },
    });

    if (!definition) {
      throw new RegistryOperationError("KPI was not found");
    }

    const [alignments, hierarchyEdges] = await Promise.all([
      this.prisma.alignment.findMany({
        where: { kpiDefinitionId },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.kpiHierarchyNode.findMany({
        where: {
          OR: [
            { parentKpiId: kpiDefinitionId },
            { childKpiId: kpiDefinitionId },
          ],
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return {
      kpiDefinitionId: definition.id,
      status: toKpiStatusView(definition.status),
      affectedAlignments: alignments.map((alignment) => ({
        id: alignment.id,
        kpiDefinitionId: alignment.kpiDefinitionId,
        strategyNodeId: alignment.strategyNodeId,
        alignmentType: toAlignmentTypeView(alignment.alignmentType),
        createdAt: alignment.createdAt,
      })),
      affectedStrategyNodeIds: [
        ...new Set(alignments.map((alignment) => alignment.strategyNodeId)),
      ],
      affectedHierarchyEdges: hierarchyEdges.map((edge) => ({
        id: edge.id,
        parentKpiId: edge.parentKpiId,
        childKpiId: edge.childKpiId,
        rollupMethodRuleId: edge.rollupMethodRuleId,
        createdAt: edge.createdAt,
      })),
      strategyNodesVerified: this.strategyNodes.canVerify,
    };
  }

  /** Every version of a KPI, oldest first. Retired KPIs included. */
  async listVersions(kpiDefinitionId: string): Promise<KpiVersionView[]> {
    const versions = await this.prisma.kpiVersion.findMany({
      where: { kpiDefinitionId },
      orderBy: { version: "asc" },
    });

    return versions.map((version) => this.toVersionView(version));
  }

  /** Lists persisted KPIs with their active version, or latest draft. */
  async list(): Promise<KpiWithVersionView[]> {
    const definitions = await this.prisma.kpiDefinition.findMany({
      include: {
        activeVersion: true,
        versions: { orderBy: { version: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    });

    return definitions.map((definition) => {
      const version = definition.activeVersion ?? definition.versions[0];
      if (!version) throw new RegistryOperationError("KPI has no version");
      return {
        definition: this.toDefinitionView(definition),
        version: this.toVersionView(version),
      };
    });
  }

  /** Retrieves one persisted KPI with its active version, or latest draft. */
  async getById(kpiDefinitionId: string): Promise<KpiWithVersionView | null> {
    const definition = await this.prisma.kpiDefinition.findUnique({
      where: { id: kpiDefinitionId },
      include: {
        activeVersion: true,
        versions: { orderBy: { version: "desc" }, take: 1 },
      },
    });

    if (!definition) return null;
    const version = definition.activeVersion ?? definition.versions[0];
    if (!version) throw new RegistryOperationError("KPI has no version");
    return {
      definition: this.toDefinitionView(definition),
      version: this.toVersionView(version),
    };
  }

  /**
   * Binds a KPI version to the exact current published threshold-rule version.
   * Rebinding closes the prior relationship and appends a new history row;
   * neither referenced domain version is modified.
   */
  async bindThresholdRule(
    input: BindThresholdRuleInput,
  ): Promise<KpiThresholdRuleBindingView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`KpiThresholdRuleBinding:${input.kpiVersionId}`}))`;

        const kpiVersion = await tx.kpiVersion.findUnique({
          where: { id: input.kpiVersionId },
          select: { id: true },
        });
        if (!kpiVersion) {
          throw new RegistryOperationError("KPI version was not found");
        }

        const thresholdRule = await tx.ruleDefinition.findUnique({
          where: { id: input.thresholdRuleId },
          select: {
            id: true,
            ruleKey: true,
            version: true,
            ruleType: true,
            status: true,
            isCurrent: true,
          },
        });
        if (!thresholdRule) {
          throw new RegistryOperationError("Threshold rule was not found");
        }
        if (thresholdRule.ruleType !== "THRESHOLD_STATUS") {
          throw new RegistryOperationError(
            "The binding must reference a threshold status rule",
          );
        }
        if (thresholdRule.status !== "PUBLISHED" || !thresholdRule.isCurrent) {
          throw new RegistryOperationError(
            "The binding must reference the current published rule version",
          );
        }

        const current = await tx.kpiThresholdRuleBinding.findFirst({
          where: { kpiVersionId: input.kpiVersionId, isCurrent: true },
          include: { thresholdRule: true },
        });
        if (current?.thresholdRuleId === thresholdRule.id) {
          return this.toThresholdBindingView(current);
        }
        if (current) {
          await tx.kpiThresholdRuleBinding.update({
            where: { id: current.id },
            data: { isCurrent: false },
          });
        }

        const created = await tx.kpiThresholdRuleBinding.create({
          data: {
            kpiVersionId: input.kpiVersionId,
            thresholdRuleId: thresholdRule.id,
            createdById: input.actorUserId,
            supersedesId: current?.id ?? null,
          },
          include: { thresholdRule: true },
        });
        return this.toThresholdBindingView(created);
      });
    } catch (error) {
      throw this.rethrow(error);
    }
  }

  async getThresholdRuleBinding(
    kpiVersionId: string,
  ): Promise<KpiThresholdRuleBindingView | null> {
    const binding = await this.prisma.kpiThresholdRuleBinding.findFirst({
      where: { kpiVersionId, isCurrent: true },
      include: { thresholdRule: true },
    });
    return binding ? this.toThresholdBindingView(binding) : null;
  }

  /**
   * Serialises writes against one KPI, and confirms it exists.
   *
   * `SELECT ... FOR UPDATE` would not help for a brand new definition, so the
   * advisory lock is keyed on the definition id the same way the audit
   * snapshot writer keys on aggregate identity.
   */
  private async lockExistingDefinition(
    tx: Prisma.TransactionClient,
    kpiDefinitionId: string,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`KpiDefinition:${kpiDefinitionId}`}))`;

    const definition = await tx.kpiDefinition.findUnique({
      where: { id: kpiDefinitionId },
    });

    if (!definition) {
      throw new RegistryOperationError("KPI was not found");
    }

    return definition;
  }

  private collectMatchingFields(
    row: SimilarityRow,
    threshold: number,
  ): SimilarityMatchField[] {
    const candidates: SimilarityMatchField[] = [
      { field: "nameEn", score: row.score_name_en },
      { field: "nameAr", score: row.score_name_ar },
      { field: "descriptionEn", score: row.score_description_en },
      { field: "descriptionAr", score: row.score_description_ar },
    ];

    return candidates
      .filter((candidate) => candidate.score >= threshold)
      .sort((left, right) => right.score - left.score);
  }

  private parseStatus(value: string) {
    switch (value) {
      case "draft":
      case "active":
      case "retired":
        return value;
      default:
        throw new RegistryOperationError(
          "Stored KPI status is not recognised",
        );
    }
  }

  private toDefinitionView(definition: {
    id: string;
    activeVersionId: string | null;
    status: "DRAFT" | "ACTIVE" | "RETIRED";
    retiredAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): KpiDefinitionView {
    return {
      id: definition.id,
      activeVersionId: definition.activeVersionId,
      status: toKpiStatusView(definition.status),
      retiredAt: definition.retiredAt,
      createdAt: definition.createdAt,
      updatedAt: definition.updatedAt,
    };
  }

  private toVersionView(version: {
    id: string;
    kpiDefinitionId: string;
    version: number;
    nameEn: string;
    nameAr: string;
    descriptionEn: string | null;
    descriptionAr: string | null;
    unit: string;
    polarity: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
    frequency: "MONTHLY" | "QUARTERLY";
    dataSourceType: "MANUAL" | "FEED";
    calculationLogicText: string | null;
    ownerUserId: string;
    stewardUserId: string | null;
    activeFrom: Date;
    supersedesVersionId: string | null;
    approvalCaseId: string | null;
    publishedAt: Date | null;
    createdAt: Date;
  }): KpiVersionView {
    return {
      id: version.id,
      kpiDefinitionId: version.kpiDefinitionId,
      version: version.version,
      nameEn: version.nameEn,
      nameAr: version.nameAr,
      descriptionEn: version.descriptionEn,
      descriptionAr: version.descriptionAr,
      unit: version.unit,
      polarity: toKpiPolarityView(version.polarity),
      frequency: toKpiFrequencyView(version.frequency),
      dataSourceType: toKpiDataSourceTypeView(version.dataSourceType),
      calculationLogicText: version.calculationLogicText,
      ownerUserId: version.ownerUserId,
      stewardUserId: version.stewardUserId,
      activeFrom: version.activeFrom,
      supersedesVersionId: version.supersedesVersionId,
      approvalCaseId: version.approvalCaseId,
      publishedAt: version.publishedAt,
      createdAt: version.createdAt,
    };
  }

  private toThresholdBindingView(binding: {
    id: string;
    kpiVersionId: string;
    thresholdRuleId: string;
    supersedesId: string | null;
    createdAt: Date;
    createdById: string;
    thresholdRule: { ruleKey: string; version: number };
  }): KpiThresholdRuleBindingView {
    return {
      id: binding.id,
      kpiVersionId: binding.kpiVersionId,
      thresholdRuleId: binding.thresholdRuleId,
      ruleKey: binding.thresholdRule.ruleKey,
      ruleVersion: binding.thresholdRule.version,
      createdAt: binding.createdAt,
      createdBy: binding.createdById,
      supersedesBindingId: binding.supersedesId,
    };
  }

  /**
   * Domain errors travel untouched; anything else becomes a generic registry
   * failure so driver detail never reaches the caller.
   */
  private rethrow(error: unknown): Error {
    if (
      error instanceof RegistryOperationError ||
      error instanceof RegistryApprovalError
    ) {
      return error;
    }

    return new RegistryOperationError();
  }
}

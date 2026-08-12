import type { PrismaService } from "../../database/prisma.service";

export class KpiDetailService {
  constructor(private readonly prisma: PrismaService) {}

  async get(kpiDefinitionId: string) {
    const definition = await this.prisma.kpiDefinition.findUnique({
      where: { id: kpiDefinitionId },
      include: {
        activeVersion: { include: { owner: true } },
        versions: { orderBy: { version: "desc" }, take: 1, include: { owner: true } },
        alignments: { include: { strategyNode: true }, orderBy: { createdAt: "asc" } },
        parentLinks: {
          include: {
            childKpi: { include: { activeVersion: true, versions: { orderBy: { version: "desc" }, take: 1 } } },
            rollupMethodRule: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!definition) return null;
    const version = definition.activeVersion ?? definition.versions[0];
    if (!version) return null;

    const [targets, measurements, statuses, rollups, commentary, thresholdBinding] = await Promise.all([
      this.prisma.targetSeries.findMany({ where: { kpiVersionId: version.id }, orderBy: [{ period: "asc" }, { updatedAt: "asc" }] }),
      this.prisma.measurement.findMany({ where: { kpiVersionId: version.id }, orderBy: [{ period: "asc" }, { createdAt: "asc" }] }),
      this.prisma.statusResult.findMany({ where: { kpiVersionId: version.id }, orderBy: [{ period: "asc" }, { computedAt: "asc" }] }),
      this.prisma.rollupResult.findMany({ where: { parentKpiId: definition.id }, orderBy: [{ period: "asc" }, { computedAt: "asc" }] }),
      this.prisma.commentary.findMany({ where: { kpiVersionId: version.id }, include: { author: true }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.prisma.kpiThresholdRuleBinding.findFirst({ where: { kpiVersionId: version.id, isCurrent: true }, include: { thresholdRule: true }, orderBy: { createdAt: "desc" } }),
    ]);

    const coordinates = [...measurements, ...targets, ...statuses];
    const latestCoordinate = coordinates.at(-1);
    const scopeNodeId = latestCoordinate?.scopeNodeId ?? definition.alignments[0]?.strategyNodeId ?? null;
    const period = latestCoordinate?.period ?? null;
    const latestByKey = <T extends { scopeNodeId: string; period: string }>(rows: T[]) =>
      [...new Map(rows.map((row) => [`${row.scopeNodeId}:${row.period}`, row])).values()];

    const contributors = await Promise.all(definition.parentLinks.map(async (edge) => {
      const childVersion = edge.childKpi.activeVersion ?? edge.childKpi.versions[0];
      if (!childVersion) return null;
      const [measurement, status] = await Promise.all([
        scopeNodeId ? this.prisma.measurement.findFirst({ where: { kpiVersionId: childVersion.id, scopeNodeId, ...(period ? { period } : {}) }, orderBy: { createdAt: "desc" } }) : null,
        scopeNodeId ? this.prisma.statusResult.findFirst({ where: { kpiVersionId: childVersion.id, scopeNodeId, ...(period ? { period } : {}) }, orderBy: { computedAt: "desc" } }) : null,
      ]);
      return { definitionId: edge.childKpiId, versionId: childVersion.id, nameEn: childVersion.nameEn, unit: childVersion.unit, value: measurement ? Number(measurement.value) : null, status: status?.status ?? null, rollupRuleId: edge.rollupMethodRuleId, rollupRuleDocument: edge.rollupMethodRule.documentJson };
    }));

    return {
      definition: { id: definition.id, status: definition.status.toLowerCase(), retiredAt: definition.retiredAt },
      version: { id: version.id, version: version.version, nameEn: version.nameEn, nameAr: version.nameAr, descriptionEn: version.descriptionEn, descriptionAr: version.descriptionAr, unit: version.unit, polarity: version.polarity.toLowerCase(), frequency: version.frequency.toLowerCase(), dataSourceType: version.dataSourceType.toLowerCase(), ownerUserId: version.ownerUserId, ownerName: version.owner.displayName ?? version.owner.email, publishedAt: version.publishedAt },
      scopeNodeId,
      period,
      targets: latestByKey(targets).map((row) => ({ ...row, targetValue: Number(row.targetValue) })),
      measurements: latestByKey(measurements).map((row) => ({ ...row, value: Number(row.value) })),
      statuses: latestByKey(statuses),
      rollups: latestByKey(rollups).map((row) => ({ ...row, aggregatedValue: row.aggregatedValue === null ? null : Number(row.aggregatedValue) })),
      contributors: contributors.filter((value) => value !== null),
      commentary: commentary.map((row) => ({ id: row.id, bodyEn: row.bodyEn, bodyAr: row.bodyAr, authorId: row.authorId, authorName: row.author.displayName ?? row.author.email, createdAt: row.createdAt, period: row.period, scopeNodeId: row.scopeNodeId })),
      alignments: definition.alignments.map((row) => ({ id: row.id, alignmentType: row.alignmentType.toLowerCase(), strategyNodeId: row.strategyNodeId, strategyNodeName: row.strategyNode.nameEn, strategyNodeType: row.strategyNode.type.toLowerCase() })),
      thresholdBinding: thresholdBinding ? { id: thresholdBinding.id, thresholdRuleId: thresholdBinding.thresholdRuleId, ruleKey: thresholdBinding.thresholdRule.ruleKey, ruleVersion: thresholdBinding.thresholdRule.version, ruleDocument: thresholdBinding.thresholdRule.documentJson } : null,
    };
  }
}

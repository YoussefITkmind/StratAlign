import { describe, expect, it, vi } from "vitest";
import { KpiDetailService } from "../../src/modules/performance/kpi-detail.service";
import { CommentaryService } from "../../src/modules/performance/commentary.service";

describe("Prompt 2.9 persisted KPI detail", () => {
  it("loads definition, targets, performance, contributors, alignment, commentary and Registry binding", async () => {
    const prisma = {
      kpiDefinition: { findUnique: vi.fn().mockResolvedValue({
        id: "definition", status: "ACTIVE", retiredAt: null,
        activeVersion: { id: "version", version: 2, nameEn: "Revenue", nameAr: "Revenue", descriptionEn: null, descriptionAr: null, unit: "%", polarity: "HIGHER_IS_BETTER", frequency: "MONTHLY", dataSourceType: "MANUAL", ownerUserId: "owner", owner: { displayName: "Owner", email: "owner@example.test" }, publishedAt: new Date() }, versions: [],
        alignments: [{ id: "alignment", alignmentType: "OBJECTIVE", strategyNodeId: "scope", strategyNode: { nameEn: "Growth", type: "OBJECTIVE" } }],
        parentLinks: [{ childKpiId: "child", rollupMethodRuleId: "rollup-rule", rollupMethodRule: { documentJson: { method: "sum" } }, childKpi: { activeVersion: { id: "child-version", nameEn: "Child", unit: "%" }, versions: [] } }],
      }) },
      targetSeries: { findMany: vi.fn().mockResolvedValue([{ id: "target", kpiVersionId: "version", scopeNodeId: "scope", period: "2026-08", targetValue: 90, planVersionId: "plan" }]) },
      measurement: { findMany: vi.fn().mockResolvedValue([{ id: "measurement", kpiVersionId: "version", scopeNodeId: "scope", period: "2026-08", value: 91, createdAt: new Date() }]), findFirst: vi.fn().mockResolvedValue({ value: 40 }) },
      statusResult: { findMany: vi.fn().mockResolvedValue([{ id: "status", kpiVersionId: "version", scopeNodeId: "scope", period: "2026-08", status: "green", computedAt: new Date(), ruleVersionUsed: "threshold-rule" }]), findFirst: vi.fn().mockResolvedValue({ status: "amber" }) },
      rollupResult: { findMany: vi.fn().mockResolvedValue([{ id: "rollup", parentKpiId: "definition", scopeNodeId: "scope", period: "2026-08", aggregatedValue: 91, method: "sum", computedAt: new Date(), ruleVersionUsed: "rollup-rule" }]) },
      commentary: { findMany: vi.fn().mockResolvedValue([{ id: "comment", bodyEn: "Persisted", bodyAr: null, authorId: "owner", author: { displayName: "Owner", email: "owner@example.test" }, createdAt: new Date(), period: "2026-08", scopeNodeId: "scope" }]) },
      kpiThresholdRuleBinding: { findFirst: vi.fn().mockResolvedValue({ id: "binding", thresholdRuleId: "threshold-rule", thresholdRule: { ruleKey: "rag", version: 3, documentJson: { bands: [] } } }) },
    };
    const result = await new KpiDetailService(prisma as never).get("definition");
    expect(result?.version.nameEn).toBe("Revenue");
    expect(result?.targets[0]?.targetValue).toBe(90);
    expect(result?.measurements[0]?.value).toBe(91);
    expect(result?.statuses[0]?.status).toBe("green");
    expect(result?.rollups[0]?.aggregatedValue).toBe(91);
    expect(result?.contributors[0]?.definitionId).toBe("child");
    expect(result?.alignments[0]?.strategyNodeName).toBe("Growth");
    expect(result?.commentary[0]?.bodyEn).toBe("Persisted");
    expect(result?.thresholdBinding?.thresholdRuleId).toBe("threshold-rule");
  });

  it("commentary survives a service reload because add and list use persistence", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const prisma = { commentary: {
      create: vi.fn(async ({ data }) => { const row = { id: "comment", ...data, createdAt: new Date() }; rows.push(row); return row; }),
      findMany: vi.fn(async () => rows),
    } };
    await new CommentaryService(prisma as never).add({ kpiVersionId: "version", scopeNodeId: "scope", period: "2026-08", authorId: "owner", bodyEn: "Persisted" });
    const reloaded = await new CommentaryService(prisma as never).list({ kpiVersionId: "version", scopeNodeId: "scope", period: "2026-08", limit: 100 });
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.bodyEn).toBe("Persisted");
  });
});

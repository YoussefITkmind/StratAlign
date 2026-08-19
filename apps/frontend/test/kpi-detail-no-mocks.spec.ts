import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Phase 2 production data paths", () => {
  it("keeps completed pages on persisted API clients", () => {
    const detail = readFileSync(new URL("../src/components/kpi-detail/KpiDetailView.tsx", import.meta.url), "utf8");
    const productionPaths = [
      "../src/components/kpi-registry/RegistryPanels.tsx",
      "../src/components/rule-builder/RuleBuilderPanel.tsx",
      "../src/components/approvals/approvals-client.tsx",
      "../src/components/approvals/case-detail-client.tsx",
      "../src/components/capture/CaptureTaskList.tsx",
      "../src/components/capture/CaptureSessionView.tsx",
      "../src/components/kpi-detail/KpiDetailView.tsx",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

    for (const source of productionPaths) {
      expect(source).not.toMatch(/mockKpiData|mockStrategyNodes|mockCadenceTasks|KpiStoreProvider|ruleEngine|mock-db/);
      expect(source).toContain("trpc.");
    }
    expect(detail).toContain("trpc.capture.detail.useQuery");
    expect(detail).toContain("trpc.capture.addCommentary.useMutation");
  });
});

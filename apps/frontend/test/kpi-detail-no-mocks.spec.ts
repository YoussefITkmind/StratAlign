import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Prompt 2.9 KPI Detail production data", () => {
  it("does not import mock KPI or strategy data", () => {
    const detail = readFileSync(new URL("../src/components/kpi-detail/KpiDetailView.tsx", import.meta.url), "utf8");
    expect(detail).not.toMatch(/mockKpiData|mockStrategyNodes|KpiStoreProvider/);
    expect(detail).toContain("trpc.capture.detail.useQuery");
    expect(detail).toContain("trpc.capture.addCommentary.useMutation");
  });
});

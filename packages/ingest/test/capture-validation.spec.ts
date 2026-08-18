import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runValidation } from "../src";

describe("Prompt 2.8 regression", () => {
  it("keeps one bad row rejected with a reason through shared DuckDB validation", async () => {
    const csv = join(await mkdtemp(join(tmpdir(), "capture-regression-")), "capture.csv");
    await writeFile(csv, "period,value\n2026-Q1,12\n2026-Q1,nope\n2026-Q1,100\n");
    const report = await runValidation(join(import.meta.dirname, "../transforms/manual-template/capture-validation.sql"), { raw_csv: csv, expected_period: "2026-Q1", mean: 10, sd: 1 });
    expect(report.passed).toBe(false);
    expect(report.details.map((row) => row.outcome)).toEqual(["accepted", "rejected", "warning"]);
    expect(report.details[1]?.reason).toBe("period and numeric value are required");
  });
});

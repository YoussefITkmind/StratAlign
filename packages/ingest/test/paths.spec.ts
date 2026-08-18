import { describe, expect, it } from "vitest";
import { conformedDatasetPath, rawRunPath, validateManifest } from "../src";

describe("object storage convention", () => {
  it("builds canonical immutable raw and conformed keys", () => {
    expect(rawRunPath("generic", "2026-08-18", "00000000-0000-0000-0000-000000000001")).toBe("raw/generic/2026-08-18/00000000-0000-0000-0000-000000000001");
    expect(conformedDatasetPath("generic", "2026-08", "kpi-actuals")).toBe("conformed/generic/2026-08/kpi-actuals.parquet");
  });
  it("rejects a manifest whose total disagrees with its files", () => {
    expect(() => validateManifest({ source: "generic", extractionTs: new Date().toISOString(), rowCount: 2, files: [{ path: "actuals.csv", rowCount: 1, checksum: "a".repeat(64) }] })).toThrow(/row count/);
  });
});

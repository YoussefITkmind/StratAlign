import { describe, expect, it, vi } from "vitest";
import { CaptureWorkspaceService } from "../../src/modules/performance/capture-workspace.service";

const service = new CaptureWorkspaceService({} as never, {
  endpoint: "http://127.0.0.1:19000",
  accessKey: "test-access-key",
  secretKey: "test-secret-key",
  bucket: "artifacts",
});

describe("isolated Prompt 2.8 template validation", () => {
  const putObject = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(service as unknown as { storageClient: () => { putObject: typeof putObject } }, "storageClient").mockReturnValue({ putObject });

  it("generates and validates CSV rows with accepted, rejected, and warning outcomes", async () => {
    const csv = Buffer.from("period,value\n2026-Q1,12\n2026-Q1,nope\n2026-Q1,100\n");
    const rows = await service.validateTemplate(csv, "csv", "2026-Q1", [9, 10, 11]);
    expect(rows.map((row) => row.outcome)).toEqual(["accepted", "rejected", "warning"]);
    expect(service.template("csv", "2026-Q1", 10).toString()).toContain("2026-Q1");
  });

  it("generates and validates XLSX rows with accepted and invalid data", async () => {
    const workbook = service.template("xlsx", "2026-Q1", 10);
    expect((await service.validateTemplate(workbook, "xlsx", "2026-Q1", [9, 10, 11]))[0]?.outcome).toBe("accepted");
    const invalid = service.template("xlsx", "wrong-period", 10);
    expect((await service.validateTemplate(invalid, "xlsx", "2026-Q1", [9, 10, 11]))[0]?.outcome).toBe("rejected");
  });

  it("rejects disallowed evidence types before contacting object storage", async () => {
    await expect(service.uploadEvidence("session", "payload.exe", "application/x-msdownload", Buffer.from("x")))
      .rejects.toThrow("not allowed");
  });
});

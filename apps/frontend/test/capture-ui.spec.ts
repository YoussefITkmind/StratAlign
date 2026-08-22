import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Capture Workspace server processing", () => {
  it("uses backend procedures and contains no browser FileReader parsing", () => {
    const source = readFileSync(new URL("../src/components/capture/CaptureSessionView.tsx", import.meta.url), "utf8");
    expect(source).toContain("trpc.capture.validate.useMutation");
    expect(source).toContain("trpc.capture.uploadEvidence.useMutation");
    expect(source).toContain("trpc.capture.saveDraft.useMutation");
    expect(source).not.toContain("FileReader");
    expect(source).not.toContain("readAsText");
  });

  it("keeps the plausibility warning non-blocking", () => {
    const source = readFileSync(new URL("../src/components/capture/CaptureSessionView.tsx", import.meta.url), "utf8");
    expect(source).toContain('data-testid="plausibility-warning"');
    expect(source).toContain("submission remains allowed");
    expect(source).not.toMatch(/disabled=\{warning\}/);
  });

  it("binds the unchanged validation report to server reconciliation results", () => {
    const source = readFileSync(new URL("../src/components/capture/CaptureSessionView.tsx", import.meta.url), "utf8");
    expect(source).toContain("onSuccess:setRows");
    expect(source).toContain("{r.outcome} {r.reason}");
    expect(source).not.toContain("sheet_to_json");
    expect(source).not.toContain("Expected period ${task.period}");
  });
});

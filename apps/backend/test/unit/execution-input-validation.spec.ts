import { describe, expect, it } from "vitest";
import {
  initiativeRegisterInputSchema,
  statusUpdateInputSchema,
} from "@spm/api/execution";

describe("Execution API strict input boundary", () => {
  it("rejects project-management fields such as assignedResources", () => {
    const parsed = initiativeRegisterInputSchema.safeParse({
      nameEn: "Customer Platform",
      nameAr: "منصة العملاء",
      strategicPlayNodeId: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      stage: "execute",
      assignedResources: ["developer-a", "designer-b"],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
    }
  });

  it("rejects Gantt/task-shaped fields on the monthly status form", () => {
    expect(statusUpdateInputSchema.safeParse({
      initiativeId: "33333333-3333-4333-8333-333333333333",
      period: "2026-08",
      stage: "execute",
      status: "on_track",
      confidence: "high",
      narrativeEn: "Delivery remains on plan",
      taskList: [{ name: "Build sprint", percentComplete: 75 }],
      ganttStartDate: "2026-08-01",
    }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  initiativeRegisterInputSchema,
  projectCreateInputSchema,
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

  it("accepts an initiative registration with the optional detail fields", () => {
    const parsed = initiativeRegisterInputSchema.safeParse({
      nameEn: "Customer Platform",
      nameAr: "منصة العملاء",
      strategicPlayNodeId: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      stage: "execute",
      priority: "high",
      department: "Engineering",
      startDate: "2025-08-01",
      endDate: "2025-12-01",
      tags: ["Tech", "Sales Ops"],
      budgetAmount: 50000,
      currency: "USD",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an initiative registration whose end date precedes its start date", () => {
    const parsed = initiativeRegisterInputSchema.safeParse({
      nameEn: "Customer Platform",
      nameAr: "منصة العملاء",
      strategicPlayNodeId: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      stage: "execute",
      startDate: "2025-12-01",
      endDate: "2025-08-01",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a project create payload carrying task/dependency-shaped fields", () => {
    const parsed = projectCreateInputSchema.safeParse({
      name: "Salesforce CPQ Integration",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      taskList: [{ name: "Kickoff", percentComplete: 0 }],
      dependencies: ["44444444-4444-4444-8444-444444444444"],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
    }
  });

  it("accepts a standalone project with no parent initiative", () => {
    const parsed = projectCreateInputSchema.safeParse({
      name: "Salesforce CPQ Integration",
      description: "What will this project deliver?",
      department: "Engineering",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      startDate: "2025-08-01",
      endDate: "2025-12-01",
      budgetAmount: 50000,
      priority: "medium",
      jiraBoardUrl: "https://example.atlassian.net/jira/software/projects/CPQ",
      confluenceSpaceUrl: "https://example.atlassian.net/wiki/spaces/CPQ",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a project whose end date precedes its start date", () => {
    const parsed = projectCreateInputSchema.safeParse({
      name: "Salesforce CPQ Integration",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      startDate: "2025-12-01",
      endDate: "2025-08-01",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-URL Jira board link", () => {
    const parsed = projectCreateInputSchema.safeParse({
      name: "Salesforce CPQ Integration",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      jiraBoardUrl: "not-a-url",
    });
    expect(parsed.success).toBe(false);
  });
});

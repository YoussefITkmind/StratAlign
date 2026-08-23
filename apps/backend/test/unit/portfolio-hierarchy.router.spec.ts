import { rootRouter } from "@spm/api/root";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const diffId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mappingId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const playId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const planVersionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const approverId = "approver-user";
const resolveAuthorization = vi.fn();
const importHierarchyDryRun = vi.fn();
const getHierarchyDiff = vi.fn();
const resolveHierarchyMatch = vi.fn();
const commitHierarchyImport = vi.fn();

const session = { user: { id: userId, email: "admin@example.test", name: "Admin" }, authenticatedAt: new Date(), sessionId: "11111111-1111-4111-8111-111111111111", expiresAt: new Date(Date.now() + 60_000), authenticationMethod: "credentials" as const };

function context() {
  return {
    session,
    authorization: { resolve: resolveAuthorization },
    auditTap: { recordCompletedCall: vi.fn() },
    portfolio: { importHierarchyDryRun, getHierarchyDiff, resolveHierarchyMatch, commitHierarchyImport, findUnmappedPlays: vi.fn(), computeRag: vi.fn() },
  };
}

describe("portfolio hierarchy API boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthorization.mockResolvedValue({ userId, roles: ["seo_administrator"], scopeGrants: [], authenticatedAt: new Date() });
    importHierarchyDryRun.mockResolvedValue({ diffId });
    getHierarchyDiff.mockResolvedValue({ diffId });
    resolveHierarchyMatch.mockResolvedValue({ diffId });
    commitHierarchyImport.mockResolvedValue({ diffId });
  });

  it("requires seo_administrator for every hierarchy procedure", async () => {
    resolveAuthorization.mockResolvedValue({ userId, roles: ["strategy_analyst"], scopeGrants: [], authenticatedAt: new Date() });
    const caller = rootRouter.createCaller(context() as never);
    await expect(caller.portfolio.hierarchy.importDryRun({ base64: "e30=", format: "json", planVersionId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.portfolio.hierarchy.getDiff({ diffId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.portfolio.hierarchy.resolveMatch({ diffId, mappingId, playId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.portfolio.hierarchy.commit({ diffId, approvalParticipantId: approverId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects unknown input fields", async () => {
    const caller = rootRouter.createCaller(context() as never);
    await expect(caller.portfolio.hierarchy.importDryRun({ base64: "e30=", format: "json", planVersionId, actorUserId: "spoofed" } as never)).rejects.toBeTruthy();
    await expect(caller.portfolio.hierarchy.getDiff({ diffId, extra: true } as never)).rejects.toBeTruthy();
    await expect(caller.portfolio.hierarchy.resolveMatch({ diffId, mappingId, playId, extra: true } as never)).rejects.toBeTruthy();
    await expect(caller.portfolio.hierarchy.commit({ diffId, approvalParticipantId: approverId, submittedBy: "spoofed" } as never)).rejects.toBeTruthy();
  });

  it("derives actor identity from the authenticated session", async () => {
    const caller = rootRouter.createCaller(context() as never);
    await caller.portfolio.hierarchy.importDryRun({ base64: "e30=", format: "json", planVersionId });
    expect(importHierarchyDryRun).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: userId }));
    await caller.portfolio.hierarchy.commit({ diffId, approvalParticipantId: approverId });
    expect(commitHierarchyImport).toHaveBeenCalledWith({ diffId, approvalParticipantId: approverId, actorUserId: userId });
  });
});

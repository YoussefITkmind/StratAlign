import { beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceService } from "../../src/modules/performance/performance.service";

// Mock dependencies
const mockPrisma = {
  commentary: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

const mockEventBus = {
  publishWithin: vi.fn(),
};

describe("Performance commentary CRUD with bilingual content", () => {
  let performance: PerformanceService;

  beforeEach(() => {
    performance = new PerformanceService(
      mockPrisma as any,
      mockEventBus as any,
    );
    vi.clearAllMocks();
  });

  it("addCommentary creates commentary with English content only", async () => {
    mockPrisma.commentary.create.mockResolvedValue({
      id: "commentary-1",
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      authorId: "user-1",
      bodyEn: "This is English commentary",
      bodyAr: null,
      createdAt: new Date(),
    });

    const result = await performance.addCommentary({
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      authorId: "user-1",
      bodyEn: "This is English commentary",
    });

    expect(mockPrisma.commentary.create).toHaveBeenCalledWith({
      data: {
        kpiVersionId: "kpi-1",
        scopeNodeId: "scope-1",
        period: "2026-01",
        authorId: "user-1",
        bodyEn: "This is English commentary",
        bodyAr: null,
      },
    });
    expect(result.bodyEn).toBe("This is English commentary");
    expect(result.bodyAr).toBeNull();
  });

  it("addCommentary creates commentary with Arabic content only", async () => {
    mockPrisma.commentary.create.mockResolvedValue({
      id: "commentary-2",
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      authorId: "user-1",
      bodyEn: null,
      bodyAr: "هذا تعليق باللغة العربية",
      createdAt: new Date(),
    });

    const result = await performance.addCommentary({
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      authorId: "user-1",
      bodyAr: "هذا تعليق باللغة العربية",
    });

    expect(mockPrisma.commentary.create).toHaveBeenCalledWith({
      data: {
        kpiVersionId: "kpi-1",
        scopeNodeId: "scope-1",
        period: "2026-01",
        authorId: "user-1",
        bodyEn: null,
        bodyAr: "هذا تعليق باللغة العربية",
      },
    });
    expect(result.bodyEn).toBeNull();
    expect(result.bodyAr).toBe("هذا تعليق باللغة العربية");
  });

  it("addCommentary creates commentary with both English and Arabic content", async () => {
    mockPrisma.commentary.create.mockResolvedValue({
      id: "commentary-3",
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      authorId: "user-1",
      bodyEn: "Performance exceeded targets",
      bodyAr: "تجاوز الأداء الأهداف",
      createdAt: new Date(),
    });

    const result = await performance.addCommentary({
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      authorId: "user-1",
      bodyEn: "Performance exceeded targets",
      bodyAr: "تجاوز الأداء الأهداف",
    });

    expect(mockPrisma.commentary.create).toHaveBeenCalledWith({
      data: {
        kpiVersionId: "kpi-1",
        scopeNodeId: "scope-1",
        period: "2026-01",
        authorId: "user-1",
        bodyEn: "Performance exceeded targets",
        bodyAr: "تجاوز الأداء الأهداف",
      },
    });
    expect(result.bodyEn).toBe("Performance exceeded targets");
    expect(result.bodyAr).toBe("تجاوز الأداء الأهداف");
  });

  it("addCommentary handles empty content gracefully", async () => {
    mockPrisma.commentary.create.mockResolvedValue({
      id: "commentary-4",
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      authorId: "user-1",
      bodyEn: null,
      bodyAr: null,
      createdAt: new Date(),
    });

    const result = await performance.addCommentary({
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      authorId: "user-1",
    });

    expect(mockPrisma.commentary.create).toHaveBeenCalledWith({
      data: {
        kpiVersionId: "kpi-1",
        scopeNodeId: "scope-1",
        period: "2026-01",
        authorId: "user-1",
        bodyEn: null,
        bodyAr: null,
      },
    });
    expect(result.bodyEn).toBeNull();
    expect(result.bodyAr).toBeNull();
  });

  it("addCommentary preserves author information", async () => {
    mockPrisma.commentary.create.mockResolvedValue({
      id: "commentary-5",
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      authorId: "user-123",
      bodyEn: "Author comment",
      bodyAr: null,
      createdAt: new Date(),
    });

    const result = await performance.addCommentary({
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      authorId: "user-123",
      bodyEn: "Author comment",
    });

    expect(result.authorId).toBe("user-123");
  });
});

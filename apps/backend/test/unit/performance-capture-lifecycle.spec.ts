import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureSessionError } from "../../src/modules/performance/performance.errors";
import { PerformanceService } from "../../src/modules/performance/performance.service";

// Mock dependencies
const mockPrisma = {
  $transaction: vi.fn(async (callback: any) => callback({})),
  captureSession: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  measurement: {
    findFirst: vi.fn(),
  },
};

const mockEventBus = {
  publishWithin: vi.fn(),
};

describe("Performance capture session lifecycle", () => {
  let performance: PerformanceService;

  beforeEach(() => {
    performance = new PerformanceService(
      mockPrisma as any,
      mockEventBus as any,
    );
    vi.clearAllMocks();
  });

  it("startCaptureSession creates new draft session", async () => {
    mockPrisma.captureSession.findUnique.mockResolvedValue(null);
    mockPrisma.captureSession.create.mockResolvedValue({
      id: "session-1",
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      state: "draft",
      ownerId: "user-1",
    });

    const result = await performance.startCaptureSession({
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      ownerId: "user-1",
    });

    expect(mockPrisma.captureSession.create).toHaveBeenCalledWith({
      data: {
        kpiVersionId: "kpi-1",
        scopeNodeId: "scope-1",
        period: "2026-01",
        state: "draft",
        ownerId: "user-1",
      },
    });
    expect(result.sessionId).toBe("session-1");
  });

  it("startCaptureSession returns existing draft session", async () => {
    mockPrisma.captureSession.findUnique.mockResolvedValue({
      id: "session-1",
      state: "draft",
    });

    const result = await performance.startCaptureSession({
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      ownerId: "user-1",
    });

    expect(mockPrisma.captureSession.create).not.toHaveBeenCalled();
    expect(result.sessionId).toBe("session-1");
  });

  it("startCaptureSession rejects when session already submitted", async () => {
    mockPrisma.captureSession.findUnique.mockResolvedValue({
      id: "session-1",
      state: "submitted",
    });

    await expect(
      performance.startCaptureSession({
        kpiVersionId: "kpi-1",
        scopeNodeId: "scope-1",
        period: "2026-01",
        ownerId: "user-1",
      }),
    ).rejects.toThrow(CaptureSessionError);
  });

  it("submitCaptureSession creates measurement and updates session state", async () => {
    mockPrisma.captureSession.findUnique.mockResolvedValue({
      id: "session-1",
      kpiVersionId: "kpi-1",
      scopeNodeId: "scope-1",
      period: "2026-01",
      state: "draft",
      ownerId: "user-1",
    });
    mockPrisma.measurement.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      return callback({
        measurement: {
          create: vi.fn().mockResolvedValue({
            id: "measurement-1",
            value: 85.0,
          }),
        },
        captureSession: {
          update: vi.fn().mockResolvedValue({}),
        },
      });
    });

    const result = await performance.submitCaptureSession({
      sessionId: "session-1",
      measurementValue: 85.0,
    });

    expect(result.value).toBe(85.0);
  });

  it("submitCaptureSession rejects non-draft session", async () => {
    mockPrisma.captureSession.findUnique.mockResolvedValue({
      id: "session-1",
      state: "submitted",
    });

    await expect(
      performance.submitCaptureSession({
        sessionId: "session-1",
        measurementValue: 85.0,
      }),
    ).rejects.toThrow(CaptureSessionError);
  });

  it("recallCaptureSession updates session to recalled state", async () => {
    mockPrisma.captureSession.findUnique.mockResolvedValue({
      id: "session-1",
      state: "submitted",
    });
    mockPrisma.captureSession.update.mockResolvedValue({});

    await performance.recallCaptureSession({
      sessionId: "session-1",
    });

    expect(mockPrisma.captureSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { state: "recalled" },
    });
  });

  it("recallCaptureSession rejects non-submitted session", async () => {
    mockPrisma.captureSession.findUnique.mockResolvedValue({
      id: "session-1",
      state: "draft",
    });

    await expect(
      performance.recallCaptureSession({
        sessionId: "session-1",
      }),
    ).rejects.toThrow(CaptureSessionError);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { trpcClient } from "../src/services/api-client";
import {
  getHealthStatus,
  type HealthStatus,
} from "../src/services/health.service";

vi.mock("../src/services/api-client", () => ({
  trpcClient: {
    health: {
      check: {
        query: vi.fn(),
      },
    },
  },
}));

const mockedHealthQuery = vi.mocked(
  trpcClient.health.check.query,
);

const healthyResponse: HealthStatus = {
  status: "ok",
  service: "spm-backend",
  database: "connected",
  redis: "connected",
  timestamp: "2026-08-03T12:00:00.000Z",
  uptimeSeconds: 10,
};

describe("getHealthStatus", () => {
  beforeEach(() => {
    mockedHealthQuery.mockReset();
  });

  it("returns backend health information", async () => {
    mockedHealthQuery.mockResolvedValue(healthyResponse);

    await expect(getHealthStatus()).resolves.toEqual(
      healthyResponse,
    );
    expect(mockedHealthQuery).toHaveBeenCalledOnce();
  });

  it("returns null when the backend request fails", async () => {
    mockedHealthQuery.mockRejectedValue(
      new Error("Backend unavailable"),
    );

    await expect(getHealthStatus()).resolves.toBeNull();
  });
});
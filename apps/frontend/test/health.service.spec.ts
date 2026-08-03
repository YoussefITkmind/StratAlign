import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../src/services/api-client";
import {
  getHealthStatus,
  type HealthStatus,
} from "../src/services/health.service";

vi.mock("../src/services/api-client", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

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
    mockedApiRequest.mockReset();
  });

  it("returns backend health information", async () => {
    mockedApiRequest.mockResolvedValue(healthyResponse);

    await expect(getHealthStatus()).resolves.toEqual(healthyResponse);
    expect(mockedApiRequest).toHaveBeenCalledWith("/health");
  });

  it("returns null when the backend request fails", async () => {
    mockedApiRequest.mockRejectedValue(new Error("Backend unavailable"));

    await expect(getHealthStatus()).resolves.toBeNull();
  });
});
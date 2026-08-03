import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../src/database/prisma.service";
import { HealthService } from "../../src/modules/health/health.service";
import { RedisService } from "../../src/redis/redis.service";

describe("HealthService", () => {
  let healthService: HealthService;
  let queryRaw: ReturnType<typeof vi.fn>;
  let redisPing: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryRaw = vi.fn().mockResolvedValue([{ result: 1 }]);
    redisPing = vi.fn().mockResolvedValue("PONG");

    const prisma = {
      $queryRaw: queryRaw,
    } as unknown as PrismaService;

    const redis = {
      ping: redisPing,
    } as unknown as RedisService;

    healthService = new HealthService(prisma, redis);
  });

  it("reports the backend, database, and Redis as healthy", async () => {
    const result = await healthService.check();

    expect(result.status).toBe("ok");
    expect(result.service).toBe("spm-backend");
    expect(result.database).toBe("connected");
    expect(result.redis).toBe("connected");
    expect(result.timestamp).toBeTypeOf("string");
    expect(result.uptimeSeconds).toBeTypeOf("number");

    expect(queryRaw).toHaveBeenCalledOnce();
    expect(redisPing).toHaveBeenCalledOnce();
  });

  it("marks Redis as unavailable when ping does not return PONG", async () => {
    redisPing.mockResolvedValue("UNEXPECTED");

    const result = await healthService.check();

    expect(result.database).toBe("connected");
    expect(result.redis).toBe("unavailable");
  });

  it("rejects when the database health query fails", async () => {
    queryRaw.mockRejectedValue(new Error("Database unavailable"));

    await expect(healthService.check()).rejects.toThrow(
      "Database unavailable",
    );
  });
});
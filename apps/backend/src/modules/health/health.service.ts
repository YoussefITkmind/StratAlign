import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { RedisService } from "../../redis/redis.service";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check() {
    const [, redisResponse] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);

    return {
      status: "ok",
      service: "spm-backend",
      database: "connected",
      redis: redisResponse === "PONG" ? "connected" : "unavailable",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
import "dotenv/config";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { validateEnvironment } from "./config/env.validation";
import { PrismaService } from "./database/prisma.service";
import { HealthService } from "./modules/health/health.service";
import { RedisService } from "./redis/redis.service";
import { appRouter } from "@spm/api";

async function bootstrap(): Promise<void> {
  const environment = validateEnvironment(process.env);

  const prisma = new PrismaService(environment.DATABASE_URL);
  const redis = new RedisService(environment.REDIS_URL);
  const health = new HealthService(prisma, redis);

  await Promise.all([
    prisma.connect(),
    redis.connect(),
  ]);

  const server = createHTTPServer({
    router: appRouter,
    basePath: "/trpc/",

    createContext() {
      return {
        prisma,
        redis,
        health,
      };
    },

    middleware(request, response, next) {
      response.setHeader(
        "Access-Control-Allow-Origin",
        environment.FRONTEND_URL,
      );
      response.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS",
      );
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      response.setHeader(
        "Access-Control-Allow-Credentials",
        "true",
      );

      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.end();
        return;
      }

      next();
    },
  });

  server.listen(environment.PORT, () => {
    console.log(
      `SPM tRPC backend running at http://localhost:${environment.PORT}/trpc`,
    );
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`Received ${signal}. Shutting down.`);

    server.close();

    await Promise.all([
      prisma.disconnect(),
      redis.disconnect(),
    ]);
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

bootstrap().catch((error: unknown) => {
  console.error("Backend failed to start:", error);
  process.exitCode = 1;
});
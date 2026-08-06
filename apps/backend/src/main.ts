import "dotenv/config";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { validateEnvironment } from "./config/env.validation";
import { createServiceGraph } from "./bootstrap";
import { appRouter } from "@spm/api";

async function bootstrap(): Promise<void> {
  const environment = validateEnvironment(process.env);

  // The API process builds the same graph as the worker process but starts no
  // workers. It still needs the queue and notification services so that a
  // request can enqueue work; consuming that work is the worker's job.
  const services = createServiceGraph(environment);

  await services.connect();

  const server = createHTTPServer({
    router: appRouter,
    basePath: "/trpc/",

    createContext() {
      return {
        prisma: services.prisma,
        redis: services.redis,
        health: services.health,
        scheduler: services.schedulerService,
        notifications: services.notificationService,
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

    await services.shutdown();
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

import "dotenv/config";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { rootRouter } from "@spm/api/root";
import { validateEnvironment } from "./config/env.validation";
import { PrismaService } from "./database/prisma.service";
import { HealthService } from "./modules/health/health.service";
import { RedisService } from "./redis/redis.service";
import { createLogger } from "./logging/logger";
import { QueueConnectionProvider } from "./queue/queue-connection";
import { QueueService } from "./queue/queue.service";
import { EventBusService } from "./events/event-bus.service";
import { CredentialService } from "./modules/auth/credential.service";
import { LoginRateLimiterService } from "./modules/auth/login-rate-limiter.service";
import { SessionService } from "./modules/auth/session.service";
import { OidcTokenValidationService } from "./modules/auth/oidc-token-validation.service";
import { OidcIdentityService } from "./modules/auth/oidc-identity.service";
import { AuthenticationFreshnessService } from "./modules/iam/authentication-freshness.service";
import { IamAuthorizationService } from "./modules/iam/iam-authorization.service";
import { IamAdminService } from "./modules/iam/iam-admin.service";
import { RulesService } from "./modules/rules/rules.service";
import { SnapshotService } from "./modules/audit/snapshot.service";
import { ApiAuditTapService } from "./modules/audit/api-audit-tap.service";
import { StrategyService } from "./modules/strategy/strategy.service";
import { StrategyTraversalService } from "./modules/strategy/strategy-traversal.service";
import { KpiRegistryService } from "./modules/registry/kpi-registry.service";
import { OkrService } from "./modules/registry/okr.service";
import { AlignmentService } from "./modules/registry/alignment.service";
import { KpiHierarchyService } from "./modules/registry/kpi-hierarchy.service";
import { UnavailableApprovalGateway } from "./modules/registry/gateways/approval.gateway";
import { PrismaStrategyNodeGateway } from "./modules/registry/gateways/strategy-node.gateway";

async function bootstrap(): Promise<void> {
  const environment = validateEnvironment(process.env);
  const prisma = new PrismaService(environment.DATABASE_URL);
  const redis = new RedisService(environment.REDIS_URL);
  const health = new HealthService(prisma, redis);
  const logger = createLogger(environment.LOG_LEVEL);
  const queueConnectionProvider = new QueueConnectionProvider(environment.REDIS_URL);
  const queueService = new QueueService(queueConnectionProvider, environment.QUEUE_PREFIX, logger.child("queue"));
  const eventBus = new EventBusService(queueService, logger.child("event-bus"));

  await Promise.all([prisma.connect(), redis.connect()]);

  const credentials = await CredentialService.create(prisma);
  const loginRateLimiter = new LoginRateLimiterService(redis.getClient());
  const sessions = new SessionService(environment.AUTH_SECRET);
  const oidcTokenValidator = new OidcTokenValidationService({
    issuer: environment.AUTH_OIDC_ISSUER,
    clientId: environment.AUTH_OIDC_CLIENT_ID,
    jwksUri: environment.AUTH_OIDC_JWKS_URI,
  });
  const oidcIdentities = new OidcIdentityService(prisma, oidcTokenValidator, environment.AUTH_OIDC_ALLOW_VERIFIED_EMAIL_LINKING);
  const authenticationFreshness = new AuthenticationFreshnessService(redis.getClient(), environment.AUTH_SECRET);
  const authorization = new IamAuthorizationService(prisma, authenticationFreshness);
  const iam = new IamAdminService(prisma);
  const rules = new RulesService(prisma);
  const strategy = new StrategyService(prisma);
  const strategyTraversal = new StrategyTraversalService(environment.DATABASE_URL);

  const approvalGateway = new UnavailableApprovalGateway();
  const strategyNodeGateway = new PrismaStrategyNodeGateway(prisma);

  const registry = {
    kpi: new KpiRegistryService(
      prisma,
      approvalGateway,
      strategyNodeGateway,
    ),
    okr: new OkrService(prisma, strategyNodeGateway),
    alignment: new AlignmentService(prisma, strategyNodeGateway),
    hierarchy: new KpiHierarchyService(prisma),
  };

  const audit = new SnapshotService(prisma);
  const auditTap = new ApiAuditTapService(prisma, eventBus);

  const server = createHTTPServer({
    router: rootRouter,
    basePath: "/trpc/",
    async createContext({ req }) {
      const headers = new Headers();
      if (typeof req.headers.cookie === "string") headers.set("cookie", req.headers.cookie);
      if (typeof req.headers.authorization === "string") headers.set("authorization", req.headers.authorization);
      return {
        health,
        credentials,
        loginRateLimiter,
        clientIp: req.socket.remoteAddress ?? "unknown",
        session: await sessions.getSession({ headers }),
        oidcIdentities,
        authenticationFreshness,
        authorization,
        iam,
        rules,
        strategy,
        strategyTraversal,
        registry,
        audit,
        auditTap,
      };
    },
    middleware(request, response, next) {
      response.setHeader("Access-Control-Allow-Origin", environment.FRONTEND_URL);
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      response.setHeader("Access-Control-Allow-Credentials", "true");
      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.end();
        return;
      }
      next();
    },
  });

  server.listen(environment.PORT, () => {
    console.log(`SPM tRPC backend running at http://localhost:${environment.PORT}/trpc`);
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`Received ${signal}. Shutting down.`);
    server.close();
    await queueService.close();
    await Promise.all([strategyTraversal.destroy(), prisma.disconnect(), redis.disconnect()]);
  }

  process.once("SIGINT", () => { void shutdown("SIGINT"); });
  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
}

bootstrap().catch((error: unknown) => {
  console.error("Backend failed to start:", error);
  process.exitCode = 1;
});

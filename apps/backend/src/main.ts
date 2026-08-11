import "dotenv/config";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { validateEnvironment } from "./config/env.validation";
import { PrismaService } from "./database/prisma.service";
import { HealthService } from "./modules/health/health.service";
import { RedisService } from "./redis/redis.service";
import { createLogger } from "./logging/logger";
import { QueueConnectionProvider } from "./queue/queue-connection";
import { QueueService } from "./queue/queue.service";
import { EventBusService } from "./events/event-bus.service";
import { appRouter } from "@spm/api";
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
import { KpiRegistryService } from "./modules/registry/kpi-registry.service";
import { OkrService } from "./modules/registry/okr.service";
import { AlignmentService } from "./modules/registry/alignment.service";
import { KpiHierarchyService } from "./modules/registry/kpi-hierarchy.service";
import { UnavailableApprovalGateway } from "./modules/registry/gateways/approval.gateway";
import { UnverifiedStrategyNodeGateway } from "./modules/registry/gateways/strategy-node.gateway";
import { PerformanceService } from "./modules/performance";

async function bootstrap(): Promise<void> {
  const environment = validateEnvironment(process.env);

  const prisma = new PrismaService(environment.DATABASE_URL);
  const redis = new RedisService(environment.REDIS_URL);
  const health = new HealthService(prisma, redis);
  const logger = createLogger(environment.LOG_LEVEL);

  const queueConnectionProvider = new QueueConnectionProvider(
    environment.REDIS_URL,
  );

  const queueService = new QueueService(
    queueConnectionProvider,
    environment.QUEUE_PREFIX,
    logger.child("queue"),
  );

  const eventBus = new EventBusService(
    queueService,
    logger.child("event-bus"),
  );

  await Promise.all([
    prisma.connect(),
    redis.connect(),
  ]);

  const credentials = await CredentialService.create(prisma);

  const loginRateLimiter = new LoginRateLimiterService(
    redis.getClient(),
  );
  const sessions = new SessionService(environment.AUTH_SECRET);
  const oidcTokenValidator = new OidcTokenValidationService({
    issuer: environment.AUTH_OIDC_ISSUER,
    clientId: environment.AUTH_OIDC_CLIENT_ID,
    jwksUri: environment.AUTH_OIDC_JWKS_URI,
  });
  const oidcIdentities = new OidcIdentityService(
    prisma,
    oidcTokenValidator,
    environment.AUTH_OIDC_ALLOW_VERIFIED_EMAIL_LINKING,
  );
  const authenticationFreshness = new AuthenticationFreshnessService(
    redis.getClient(), environment.AUTH_SECRET,
  );
  const authorization = new IamAuthorizationService(prisma, authenticationFreshness);
  const iam = new IamAdminService(prisma);
  const rules = new RulesService(prisma);
  const audit = new SnapshotService(prisma);
  const auditTap = new ApiAuditTapService(
    prisma,
    eventBus,
  );

  // Registry integration seams.
  //
  // Both adapters are placeholders for modules this repository does not contain,
  // and both fail in the direction that is safe for what they guard:
  //
  //   - UnavailableApprovalGateway refuses every publication, because an absent
  //     approval checker must not become an implicit approval. This makes
  //     registry.kpi.publishVersion inert until Prompt 1.5 ships a real adapter.
  //   - UnverifiedStrategyNodeGateway accepts node ids it cannot check, because
  //     alignment is not a security boundary and refusing would disable the
  //     module's own functionality. It reports canVerify: false so callers can
  //     see that nothing confirmed the references.
  //
  // TODO(1.5): swap in a workflow-backed ApprovalGateway.
  // TODO(2.1-2.3): swap in a Strategy-module-backed StrategyNodeGateway.
  const approvalGateway = new UnavailableApprovalGateway();
  const strategyNodeGateway = new UnverifiedStrategyNodeGateway();

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

  const performance = new PerformanceService(prisma, eventBus);

  const server = createHTTPServer({
    router: appRouter,
    basePath: "/trpc/",

    async createContext({ req }) {
      const headers = new Headers();

      if (typeof req.headers.cookie === "string") {
        headers.set("cookie", req.headers.cookie);
      }

      if (typeof req.headers.authorization === "string") {
        headers.set("authorization", req.headers.authorization);
      }

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
        audit,
        auditTap,
        registry,
        performance,
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


    await queueService.close();

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

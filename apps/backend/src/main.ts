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
import { GovernanceService } from "./modules/governance/governance.service";
import { GovernanceEscalationService } from "./modules/governance/governance-escalation.service";
import { SnapshotService } from "./modules/audit/snapshot.service";
import { ApiAuditTapService } from "./modules/audit/api-audit-tap.service";
import { StrategyService } from "./modules/strategy/strategy.service";
import { StrategyTraversalService } from "./modules/strategy/strategy-traversal.service";
import { StrategyHierarchyService } from "./modules/strategy-hierarchy/strategy-hierarchy.service";
import { StrategyNodeBridgeService } from "./modules/strategy-hierarchy/strategy-node-bridge.service";
import { KpiRegistryService } from "./modules/registry/kpi-registry.service";
import { OkrService } from "./modules/registry/okr.service";
import { AlignmentService } from "./modules/registry/alignment.service";
import { KpiHierarchyService } from "./modules/registry/kpi-hierarchy.service";
import { GovernanceApprovalGateway } from "./modules/registry/gateways/approval.gateway";
import { PrismaStrategyNodeGateway } from "./modules/registry/gateways/strategy-node.gateway";
import { MeasurementService } from "./modules/performance/measurement.service";
import { CaptureWorkspaceService } from "./modules/performance/capture-workspace.service";
import { CaptureSessionService } from "./modules/performance/capture-session.service";
import { CommentaryService } from "./modules/performance/commentary.service";
import { PerformanceResultsService } from "./modules/performance/performance-results.service";
import { PerformanceService } from "./modules/performance/performance.service";
import { KpiDetailService } from "./modules/performance/kpi-detail.service";
import { ScorecardService } from "./modules/scorecard/scorecard.service";
import { BalancedScorecardService } from "./modules/scorecard/balanced-scorecard.service";
import { StageAwareExecutionService } from "./modules/execution/stage-aware-execution.service";
import { PortfolioService } from "./modules/portfolio/portfolio.service";
import { SchedulerReadService } from "./modules/scheduler/scheduler-read.service";
import { SchedulerService } from "./modules/scheduler/scheduler.service";
import { CadenceGeneratorService } from "./modules/scheduler/cadence-generator.service";
import { CadenceEngine } from "./modules/cadence/cadence.engine";
import { PeriodCalendarEngine } from "./modules/cadence/period-calendar.engine";
import { ValueManagementService } from "./modules/value/value-management.service";
import { createLlmProvider } from "./modules/ai/llm.factory";
import { ThemeContextBuilder } from "./modules/ai/theme-context.builder";
import { AiSuggestionService } from "./modules/ai/ai-suggestion.service";
import { ConnectionsService } from "./modules/integrations/connections.service";
import { SyncLogsService } from "./modules/integrations/sync-logs.service";
import { SyncInvestigationService } from "./modules/integrations/sync-investigation.service";
import { ApiKeysService } from "./modules/integrations/api-keys.service";
import { WebhooksService } from "./modules/integrations/webhooks.service";
import { WebhookDispatcherService } from "./modules/integrations/webhook-dispatcher.service";
import { ApiKeyAuthService } from "./modules/integrations/api-key-auth.service";
import { handlePublicApiRequest } from "./modules/integrations/public-api.router";
import { ContextAwareAssistantService } from "./modules/ai/assistant.service";
import { PixelRagClient } from "./modules/pixelrag/pixelrag.client";
import { TraceabilityReadService } from "./modules/traceability/traceability-read.service";

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
  const oidcTokenValidator = new OidcTokenValidationService({ issuer: environment.AUTH_OIDC_ISSUER, clientId: environment.AUTH_OIDC_CLIENT_ID, jwksUri: environment.AUTH_OIDC_JWKS_URI });
  const oidcIdentities = new OidcIdentityService(prisma, oidcTokenValidator, environment.AUTH_OIDC_ALLOW_VERIFIED_EMAIL_LINKING);
  const authenticationFreshness = new AuthenticationFreshnessService(redis.getClient(), environment.AUTH_SECRET);
  const authorization = new IamAuthorizationService(prisma, authenticationFreshness);
  const iam = new IamAdminService(prisma);
  const rules = new RulesService(prisma);
  const governance = new GovernanceService(prisma, eventBus, rules);
  const governanceEscalation = new GovernanceEscalationService(prisma, eventBus);
  const strategy = new StrategyService(prisma);
  const strategyTraversal = new StrategyTraversalService(environment.DATABASE_URL);
  const traceabilityRead = new TraceabilityReadService(prisma);
  const strategyNodeBridge = new StrategyNodeBridgeService(prisma);

  const llm = createLlmProvider(
    {
      provider: environment.AI_PROVIDER,
      apiKey: environment.AI_API_KEY,
      model: environment.AI_MODEL,
      baseUrl: environment.AI_BASE_URL,
      timeoutMs: environment.AI_TIMEOUT_MS,
      maxRetries: environment.AI_MAX_RETRIES,
    },
    logger.child("ai"),
  );

  const strategyHierarchy = new StrategyHierarchyService(prisma, strategyNodeBridge, llm);
  const approvalGateway = new GovernanceApprovalGateway(governance);
  const strategyNodeGateway = new PrismaStrategyNodeGateway(prisma);
  const registry = {
    kpi: new KpiRegistryService(prisma, approvalGateway, strategyNodeGateway),
    okr: new OkrService(prisma, strategyNodeGateway),
    alignment: new AlignmentService(prisma, strategyNodeGateway),
    hierarchy: new KpiHierarchyService(prisma),
  };
  const audit = new SnapshotService(prisma);
  const auditTap = new ApiAuditTapService(prisma, eventBus);
  const measurements = new MeasurementService(prisma, eventBus, logger.child("performance-measurement"));
  const performance = new PerformanceService(
    new CaptureSessionService(prisma, measurements, logger.child("performance-capture")),
    new CaptureWorkspaceService(prisma, { endpoint: environment.OBJECT_STORAGE_ENDPOINT, accessKey: environment.OBJECT_STORAGE_ACCESS_KEY, secretKey: environment.OBJECT_STORAGE_SECRET_KEY, bucket: environment.OBJECT_STORAGE_BUCKET }),
    measurements,
    new CommentaryService(prisma),
    new PerformanceResultsService(prisma),
    new KpiDetailService(prisma),
  );
  const scorecard = new ScorecardService(prisma, governance, rules, measurements);
  const balancedScorecard = new BalancedScorecardService(prisma);
  const execution = new StageAwareExecutionService(prisma, prisma, eventBus);
  const portfolio = new PortfolioService(prisma, rules, governance, strategy);
  const schedulerRead = new SchedulerReadService(prisma);
  const cadenceEngine = new CadenceEngine();
  const scheduler = new SchedulerService(
    prisma,
    cadenceEngine,
    { defaultTimezone: environment.SCHEDULER_DEFAULT_TIMEZONE, defaultLookaheadSeconds: environment.SCHEDULER_LOOKAHEAD_SECONDS },
    logger.child("value-checkin-scheduler"),
  );
  const cadenceGenerator = new CadenceGeneratorService(
    prisma,
    cadenceEngine,
    new PeriodCalendarEngine(),
    queueService,
    {
      maxCatchUpOccurrences: environment.SCHEDULER_MAX_CATCHUP_OCCURRENCES,
      tickIntervalMs: environment.SCHEDULER_TICK_INTERVAL_MS,
    },
    logger.child("cadence-generator"),
  );
  const value = new ValueManagementService(prisma, governance, governanceEscalation, rules, scheduler);
  const webhookDispatcher = new WebhookDispatcherService(prisma, logger.child("webhook-dispatcher"));
  const apiKeyAuth = new ApiKeyAuthService(prisma);
  const integrations = {
    connections: new ConnectionsService(prisma, webhookDispatcher),
    syncLogs: new SyncLogsService(prisma),
    // Reuses the one shared LLM abstraction above; read-only, so it is handed
    // `prisma` for reads and nothing that could retry or reconfigure a sync.
    syncInvestigation: new SyncInvestigationService(
      prisma,
      llm,
      logger.child("sync-investigation"),
    ),
    apiKeys: new ApiKeysService(prisma),
    webhooks: new WebhooksService(prisma),
  };

  const aiSuggestion = new AiSuggestionService(
    prisma,
    new ThemeContextBuilder(prisma, strategyTraversal),
    llm,
    registry.kpi,
    registry.okr,
    registry.alignment,
    eventBus,
    scheduler,
    cadenceGenerator,
    logger.child("ai-suggestion"),
  );
  const assistant = new ContextAwareAssistantService(llm, logger.child("assistant"));

  const pixelrag = environment.PIXELRAG_SERVICE_URL
    ? new PixelRagClient(
        environment.PIXELRAG_SERVICE_URL,
        environment.PIXELRAG_TIMEOUT_MS,
        environment.PIXELRAG_SERVICE_TOKEN,
      )
    : undefined;

  const server = createHTTPServer({
    router: rootRouter,
    basePath: "/trpc/",
    async createContext({ req }) {
      const headers = new Headers();
      if (typeof req.headers.cookie === "string") headers.set("cookie", req.headers.cookie);
      if (typeof req.headers.authorization === "string") headers.set("authorization", req.headers.authorization);
      return {
        health, credentials, loginRateLimiter, clientIp: req.socket.remoteAddress ?? "unknown",
        session: await sessions.getSession({ headers }), oidcIdentities, authenticationFreshness,
        authorization, iam, rules, governance, governanceEscalation, strategy, strategyTraversal, traceabilityRead,
        strategyHierarchy,
        registry, audit, auditTap, performance, scorecard, balancedScorecard, execution, portfolio, schedulerRead, value,
        aiSuggestion, assistant, integrations, pixelrag,
      };
    },
    middleware(request, response, next) {
      response.setHeader("Access-Control-Allow-Origin", environment.FRONTEND_URL);
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      response.setHeader("Access-Control-Allow-Credentials", "true");
      if (request.method === "OPTIONS") { response.statusCode = 204; response.end(); return; }
      if (request.url?.startsWith("/api/v1/")) { void handlePublicApiRequest(request, response, apiKeyAuth); return; }
      next();
    },
  });
  server.listen(environment.PORT, () => console.log(`SPM tRPC backend running at http://localhost:${environment.PORT}/trpc`));

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

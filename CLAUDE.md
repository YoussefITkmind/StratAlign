# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StratAlign (`spm-platform`) is a Strategic Performance Management platform: strategic objectives, KPI/OKR tracking, governance workflows, initiative/portfolio management, dashboards and reporting. TypeScript monorepo using pnpm workspaces + Turborepo.

- `apps/backend` — NestJS API (tRPC router, Prisma/Postgres, BullMQ/Redis job queues, `@nestjs/event-emitter`)
- `apps/frontend` — Next.js 16 / React 19
- `packages/api` — shared tRPC router (`AppRouter`) consumed by both apps
- `packages/shared-types` — shared domain types
- `packages/validation` — Zod schemas
- `packages/ui` — shared React components
- `packages/eslint-config`, `packages/typescript-config` — shared tooling configs
- `infrastructure/docker` — Dockerfiles; `docker-compose.yml` runs local Postgres + Redis

## Commands

All commands run from the repo root via Turborepo unless noted; use `--filter` to scope to one workspace.

```bash
pnpm install                          # install all workspaces

# Local infra (Postgres on :5432, Redis on :6379)
docker compose up -d

# Dev servers (backend :4000 via PORT env, frontend :3000)
pnpm dev

# Build / lint / test everything
pnpm build
pnpm lint
pnpm test

# Scope to one workspace
pnpm --filter @spm/backend <script>
pnpm --filter @spm/frontend <script>
pnpm --filter @spm/api build           # must build before backend/frontend typecheck against it

# Backend-only (from apps/backend, or via --filter @spm/backend)
pnpm db:generate                       # prisma generate
pnpm db:migrate                        # prisma migrate dev
pnpm db:seed                           # prisma db seed
pnpm db:studio                         # prisma studio
pnpm test                              # vitest run, spec files under apps/backend/test/**/*.spec.ts
pnpm exec vitest run test/cadence-generator.spec.ts   # run a single backend test file
```

CI (`.github/workflows/backend-ci.yml`, `frontend-ci.yml`, `pull-request.yml`) runs, in order: install → build `@spm/api` → prisma generate/validate/migrate deploy → db seed (backend only) → lint → test → build. Mirror that order locally when debugging a CI failure.

## Architecture

### Backend module structure (`apps/backend/src`)
`main.ts` bootstraps `AppModule`, which wires `BullModule` (Redis connection), `EventBusModule`, `PrismaModule`, and three domain modules: `SchedulerModule`, `NotificationModule`, `AuditModule`. A global `WithAuditTapMiddleware` is applied to every route.

Domain modules communicate **only through NestJS `EventEmitter2`**, not direct method calls — this is the key thing to understand before touching any of the three:

1. **Scheduler** (`modules/scheduler`) owns `CadenceDefinition`/`CadenceInstance` (monthly/quarterly/adhoc reporting periods). `SchedulerModule` registers a repeatable BullMQ job (`scheduler-queue`, every minute via `SchedulerWorker`) that advances cadence instances through `PENDING → OPEN → CLOSING → CLOSED` and emits lifecycle events defined in `modules/scheduler/events/schedule.events.ts`: `schedule.window.opened`, `schedule.window.closing`, `schedule.window.closed`, `schedule.review.due`.
2. **Notification** (`modules/notification`) subscribes to `schedule.review.due` via `NotificationEventListener` (`@OnEvent`), fans out a `review-due` template to every user, and queues deliveries on `notification-queue`. `DigestService`/`DigestWorker` run on an hourly repeatable job (`digest-queue`) to batch "digestible" templates instead of sending immediately. Templates are bilingual (`subjectEn`/`subjectAr`, `bodyEn`/`bodyAr` in `NotificationTemplate`) rendered by `TemplateRendererService`. Delivery channel is pluggable via `senders/` (`console`, `email`, `teams`) implementing a common `sender.interface.ts`.
3. **Audit** (`modules/audit`) subscribes to all four schedule events via `AuditEventListener` and writes a hash-chained `JournalEntry` (`previousHash`/`entryHash`) plus an `EntitySnapshot` of the affected `CadenceInstance`, in a single Prisma transaction. `HashChainService`/`HashChainVerificationService` + `VerificationWorker` (`audit-verification-queue`) validate chain integrity; `OutboxWorker` (`outbox-queue`) handles reliable delivery to external sinks via a `SIEMSender` interface (`'SIEMSender'` DI token, default `ConsoleSIEMSender`).

Adding a new cross-module side effect means: define/reuse an event in `schedule.events.ts` (or a new `*.events.ts`), emit it via `EventBusService`/`EventEmitter2`, and add an `@OnEvent` listener in the consuming module — don't wire modules together directly.

### Data model (`apps/backend/prisma/schema.prisma`)
Postgres via Prisma. Core entities: `PeriodCalendar`, `CadenceDefinition` → `CadenceInstance` (status enum, `dueEventEmitted` flag guards duplicate event emission), `NotificationTemplate` → `NotificationDelivery` (status enum, retry count), `User` (has `preferredLocale: EN|AR`), `JournalEntry` → `EntitySnapshot` (versioned, `isActive`/`validFrom`/`validTo` for point-in-time state).

### Frontend (`apps/frontend/src`)
Next.js App Router (`app/`). tRPC client (`services/api-client.ts`) talks to the backend's `AppRouter` from `packages/api` via `NEXT_PUBLIC_TRPC_URL`. `services/health.service.ts` and `services/auth.service.ts` wrap tRPC calls; keep new API access patterns consistent with this `services/` layer rather than calling tRPC directly from components.

### Shared packages
`packages/api` is the single source of truth for the tRPC router/types shared between backend and frontend — rebuild it (`pnpm --filter @spm/api build`) after changing its router shape, since consumers import compiled output (`dist/index.js`/`.d.ts`), not source.

### Backend test runtime
`apps/backend/vitest.config.ts` uses the `unplugin-swc` plugin (not plain esbuild) so that TypeScript's `emitDecoratorMetadata` actually gets emitted — esbuild alone doesn't implement it, which breaks NestJS's type-based DI (`Test.createTestingModule({ imports: [AppModule] })` in `test/e2e.spec.ts` needs real constructor-param metadata to resolve providers). Unit-style tests that construct services directly with `new Service(...)` don't hit this. `hookTimeout`/`testTimeout` are raised to 60s because several suites spin up `@testcontainers/postgresql` + `@testcontainers/redis` (see `test/db-test-helper.ts`), which routinely exceeds Vitest's 10s default.

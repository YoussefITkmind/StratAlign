import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request, Response, NextFunction } from 'express';
import { OutboxJobData } from '../../modules/audit/workers/outbox.worker';

/** HTTP methods considered write mutations; GET/HEAD are read-only queries. */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const AUDIT_TAP_EVENT = 'spm.api.call.completed';

export interface AuditTapMeta {
  /**
   * Override whether this route should be audited.
   *  - Mutations (POST/PUT/PATCH/DELETE): default true
   *  - Queries  (GET/HEAD/…):             default false
   */
  auditRelevant?: boolean;
}

/**
 * Derive whether a request is audit-relevant based on HTTP method and optional
 * per-route meta override.
 */
export function isAuditRelevant(method: string, meta?: AuditTapMeta): boolean {
  if (meta?.auditRelevant !== undefined) {
    return meta.auditRelevant;
  }
  return MUTATION_METHODS.has(method.toUpperCase());
}

/**
 * NestJS injectable middleware that taps completed API calls and publishes an
 * `spm.api.call.completed` event to the outbox queue when the request is
 * audit-relevant.
 *
 * Mount globally or per-route. Per-route `meta` can override the default
 * audit-relevance heuristic:
 *
 *   consumer.apply(WithAuditTapMiddleware).forRoutes(...)
 *
 * For routes where you need to override the default, call the queue directly
 * or extend with route-specific metadata passed via request decorators.
 */
@Injectable()
export class WithAuditTapMiddleware implements NestMiddleware {
  private readonly logger = new Logger(WithAuditTapMiddleware.name);

  constructor(
    @InjectQueue('outbox-queue')
    private readonly outboxQueue: Queue,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    res.on('finish', () => {
      // Read per-request meta that may have been set by a decorator/guard
      const meta = (req as Request & { auditMeta?: AuditTapMeta }).auditMeta;

      if (!isAuditRelevant(req.method, meta)) {
        return;
      }

      const payload: OutboxJobData = {
        action: AUDIT_TAP_EVENT,
        entityType: 'ApiCall',
        entityId: `${req.method}:${req.path}`,
        metadata: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
        },
      };

      // Fire-and-forget: enqueue without awaiting — middleware must be sync
      void this.outboxQueue.add('log-event', payload).catch((err: unknown) => {
        this.logger.error(
          `Failed to enqueue audit tap for ${req.method} ${req.path}: ${(err as Error).message}`,
        );
      });
    });

    next();
  }
}

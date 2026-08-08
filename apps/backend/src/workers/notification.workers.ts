import { z } from "zod";
import { PermanentError } from "../errors/app.errors";
import { QUEUE_NAMES } from "../queue/queue.constants";
import type { WorkerDefinition } from "../queue/worker.factory";
import type { NotificationDispatcher } from "../modules/notifications/notification.dispatcher";
import type { DigestService } from "../modules/notifications/digest/digest.service";

const deliveryJobSchema = z.object({
  deliveryId: z.string().min(1),
});

export function createNotificationDeliveryWorker(
  dispatcher: NotificationDispatcher,
  concurrency: number,
): WorkerDefinition {
  return {
    queue: QUEUE_NAMES.notificationDelivery,
    concurrency,
    async handle(job) {
      const parsed = deliveryJobSchema.safeParse(job.data);

      if (!parsed.success) {
        throw new PermanentError("Malformed notification delivery payload", {
          jobId: job.id,
        });
      }

      const { deliveryId } = parsed.data;

      try {
        await dispatcher.dispatch(deliveryId);
      } catch (error: unknown) {
        const maxAttempts = job.opts.attempts ?? 1;

        // BullMQ will not call this job again, so the row is closed out here.
        // Without this, an exhausted delivery would sit in PENDING for ever
        // and look like it is still on its way.
        if (job.attemptsMade + 1 >= maxAttempts) {
          await dispatcher.markExhausted(
            deliveryId,
            error instanceof Error ? error.message : String(error),
          );
        }

        throw error;
      }
    },
  };
}

export function createDigestSweepWorker(
  digestService: DigestService,
): WorkerDefinition {
  return {
    queue: QUEUE_NAMES.notificationDigest,
    // A sweep that overlaps itself would race on the same deferred rows. The
    // unique index would catch it, but serialising is cheaper.
    concurrency: 1,
    async handle() {
      await digestService.sweep();
    },
  };
}

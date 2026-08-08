import type { PrismaService } from "../../database/prisma.service";
import type { EventBusService } from "../../events/event-bus.service";

export interface RecordCompletedCallInput {
  procedurePath: string;
  procedureType: "query" | "mutation" | "subscription";
  actorUserId: string | null;
  occurredAt: Date;
}

export class ApiAuditTapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async recordCompletedCall(
    input: RecordCompletedCallInput,
  ): Promise<void> {
    const correlationId = crypto.randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await this.eventBus.publishWithin(tx, [
        {
          eventType: "spm.api.call.completed",
          eventVersion: 1,
          aggregateType: "api_procedure",
          aggregateId: input.procedurePath,
          dedupeKey: `api-call:${correlationId}`,
          occurredAt: input.occurredAt,
          payload: {
            procedurePath: input.procedurePath,
            procedureType: input.procedureType,
            actorUserId: input.actorUserId,
            correlationId,
          },
        },
      ]);
    });

    await this.eventBus.nudgeRelay();
  }
}

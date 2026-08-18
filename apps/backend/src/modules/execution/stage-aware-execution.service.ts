import type { PrismaService } from "../../database/prisma.service";
import type { EventBusService } from "../../events/event-bus.service";
import {
  ExecutionService,
  type InitiativeStage,
  type InitiativeView,
} from "./execution.service";
import {
  EXECUTION_INITIATIVE_AGGREGATE,
  EXECUTION_STAGE_EVENT_TYPE,
  EXECUTION_STAGE_EVENT_VERSION,
  initiativeStageDedupeKey,
  type InitiativeStageChangedPayload,
} from "./execution-stage.events";

const NEXT_STAGE: Readonly<Record<InitiativeStage, InitiativeStage | null>> = {
  design: "pilot",
  pilot: "execute",
  execute: "scale",
  scale: "done",
  done: null,
};

export class InitiativeStageTransitionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "InitiativeStageTransitionError";
    this.code = code;
  }
}

export class StageAwareExecutionService extends ExecutionService {
  constructor(
    prisma: PrismaService,
    private readonly stagePrisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {
    super(prisma);
  }

  override async registerInitiative(input: {
    nameEn: string;
    nameAr: string;
    strategicPlayNodeId: string;
    ownerUserId: string;
    stage: InitiativeStage;
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }): Promise<InitiativeView> {
    const created = await super.registerInitiative(input);
    await this.stagePrisma.$executeRawUnsafe(
      `UPDATE "execution"."initiatives" SET created_by = $2 WHERE id = $1::uuid AND created_by IS NULL`,
      created.id,
      input.actorUserId,
    );
    return created;
  }

  async transitionStage(input: {
    initiativeId: string;
    toStage: InitiativeStage;
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }): Promise<InitiativeView> {
    let published = false;

    const updated = await this.stagePrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        `execution.initiative.stage:${input.initiativeId}`,
      );

      const rows = await tx.$queryRawUnsafe<Array<{
        id: string;
        name_en: string;
        name_ar: string;
        strategic_play_node_id: string;
        owner_user_id: string;
        stage: InitiativeStage;
        created_at: Date;
        created_by: string | null;
      }>>(
        `SELECT id, name_en, name_ar, strategic_play_node_id, owner_user_id, stage, created_at, created_by
         FROM "execution"."initiatives" WHERE id = $1::uuid FOR UPDATE`,
        input.initiativeId,
      );
      const current = rows[0];
      if (!current) {
        throw new InitiativeStageTransitionError("EXECUTION_INITIATIVE_NOT_FOUND", "Initiative was not found");
      }

      if (!input.actorIsSeoAdministrator && current.owner_user_id !== input.actorUserId) {
        const ownership = await tx.ownerAssignment.findUnique({
          where: {
            nodeId_ownerUserId: {
              nodeId: current.strategic_play_node_id,
              ownerUserId: input.actorUserId,
            },
          },
          select: { id: true },
        });
        if (!ownership) {
          throw new InitiativeStageTransitionError("EXECUTION_STAGE_OWNERSHIP_REQUIRED", "Only the initiative owner, strategic play owner, or SEO administrator can request a stage transition");
        }
      }

      const expected = NEXT_STAGE[current.stage];
      if (expected !== input.toStage) {
        throw new InitiativeStageTransitionError(
          "EXECUTION_INVALID_STAGE_TRANSITION",
          expected === null
            ? "The initiative is already in its terminal stage"
            : `Initiative can transition only from ${current.stage} to ${expected}`,
        );
      }

      await tx.$executeRawUnsafe(
        `UPDATE "execution"."initiatives" SET stage = $2::"execution"."InitiativeStage", updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
        input.initiativeId,
        input.toStage,
      );

      const payload: InitiativeStageChangedPayload = {
        initiativeId: current.id,
        fromStage: current.stage,
        toStage: input.toStage,
        requestedBy: input.actorUserId,
        initiativeOwnerUserId: current.owner_user_id,
        initiativeCreatedBy: current.created_by ?? current.owner_user_id,
      };
      await this.eventBus.publishWithin(tx, [{
        eventType: EXECUTION_STAGE_EVENT_TYPE,
        eventVersion: EXECUTION_STAGE_EVENT_VERSION,
        aggregateType: EXECUTION_INITIATIVE_AGGREGATE,
        aggregateId: current.id,
        dedupeKey: initiativeStageDedupeKey(current.id, current.stage, input.toStage),
        payload,
      }]);
      published = true;

      return {
        id: current.id,
        nameEn: current.name_en,
        nameAr: current.name_ar,
        strategicPlayNodeId: current.strategic_play_node_id,
        ownerUserId: current.owner_user_id,
        stage: input.toStage,
        createdAt: current.created_at,
      } satisfies InitiativeView;
    });

    if (published) await this.eventBus.nudgeRelay();
    return updated;
  }
}

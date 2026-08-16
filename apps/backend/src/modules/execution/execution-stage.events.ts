import type { InitiativeStage } from "./execution.service";

export const EXECUTION_STAGE_EVENT_TYPE = "execution.initiative.stage_changed" as const;
export const EXECUTION_STAGE_EVENT_VERSION = 1 as const;
export const EXECUTION_INITIATIVE_AGGREGATE = "execution_initiative" as const;

export interface InitiativeStageChangedPayload extends Record<string, unknown> {
  initiativeId: string;
  fromStage: InitiativeStage;
  toStage: InitiativeStage;
  requestedBy: string;
  initiativeOwnerUserId: string;
  initiativeCreatedBy: string;
}

export function initiativeStageDedupeKey(initiativeId: string, fromStage: InitiativeStage, toStage: InitiativeStage): string {
  return `execution:initiative:${initiativeId}:stage:${fromStage}-to-${toStage}`;
}

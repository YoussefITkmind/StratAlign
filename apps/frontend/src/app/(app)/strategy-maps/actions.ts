"use server";

import { cookies } from "next/headers";
import { createBackendRegistryClient } from "@/server/backend-registry-client";

export type StrategyMapLinkType = "weak" | "strong" | "enables" | "impacts" | "drives" | "supports";

async function backend() {
  const store = await cookies();
  return createBackendRegistryClient(store.toString());
}

export async function createScorecard(input: { nameEn: string; planVersionId: string }) {
  return (await backend()).scorecard.create.mutate({ nameEn: input.nameEn, nameAr: input.nameEn, planVersionId: input.planVersionId });
}

export async function placeObjective(input: { perspectiveId: string; objectiveNodeId: string }) {
  return (await backend()).scorecard.map.placeObjective.mutate(input);
}

export async function draftMapLink(input: {
  scorecardId: string;
  strategyMapId?: string;
  link: { fromObjectiveId: string; toObjectiveId: string; strength: StrategyMapLinkType };
}) {
  return (await backend()).scorecard.map.draftLink.mutate(input);
}

export async function removeMapLink(input: { strategyMapId: string; linkId: string }) {
  return (await backend()).scorecard.map.removeLink.mutate(input);
}

export async function proposeMap(input: { strategyMapId: string; approvalParticipantId: string }) {
  return (await backend()).scorecard.map.propose.mutate(input);
}

export async function publishMap(input: { strategyMapId: string; approvalCaseId: string }) {
  return (await backend()).scorecard.map.publish.mutate(input);
}

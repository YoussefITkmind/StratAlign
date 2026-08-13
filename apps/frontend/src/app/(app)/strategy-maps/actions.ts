"use server";

import { cookies } from "next/headers";
import { createBackendRegistryClient } from "@/server/backend-registry-client";

async function backend() {
  const store = await cookies();
  return createBackendRegistryClient(store.toString());
}

export async function placeObjective(input: { perspectiveId: string; objectiveNodeId: string }) {
  return (await backend()).scorecard.placement.set.mutate(input);
}

export async function draftMapLink(input: {
  scorecardId: string;
  strategyMapId?: string;
  link: { fromObjectiveId: string; toObjectiveId: string; strength: "weak" | "strong" };
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

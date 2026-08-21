import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createBackendRegistryClient } from "@/server/backend-registry-client";
import { DEMO_SCORECARD_ID } from "@/data/demoStrategyMap";

export const metadata: Metadata = {
  title: "Strategy Maps · StratAlign",
};

export default async function Page() {
  const store = await cookies();
  let firstScorecardId = DEMO_SCORECARD_ID;
  try {
    const scorecards = (await createBackendRegistryClient(store.toString()).scorecard.list.query()) as Array<{ id: string }>;
    if (scorecards.length > 0) firstScorecardId = scorecards[0]!.id;
  } catch {
    // No reachable backend or no scorecards yet — fall through to the demo map.
  }
  redirect(`/strategy-maps/${firstScorecardId}`);
}

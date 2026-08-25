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
  let scorecardId = DEMO_SCORECARD_ID;

  try {
    const client = createBackendRegistryClient(store.toString());
    const balanced = (await client.scorecard.balanced.list.query()) as Array<{
      id: string;
      name?: string;
      isBalancedScorecard?: boolean;
    }>;
    const firstBalanced = balanced.find(
      (scorecard) => scorecard.isBalancedScorecard !== false && !scorecard.name?.startsWith("E2E "),
    );

    if (firstBalanced) {
      scorecardId = firstBalanced.id;
    } else {
      const scorecards = (await client.scorecard.list.query()) as Array<{ id: string }>;
      if (scorecards.length > 0) scorecardId = scorecards[0]!.id;
    }
  } catch {
    // Explicit demo fallback only when persisted scorecards cannot be resolved.
  }

  redirect(`/strategy-maps/${scorecardId}`);
}

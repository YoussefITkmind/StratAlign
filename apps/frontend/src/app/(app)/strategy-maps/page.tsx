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
    const scorecards = (await createBackendRegistryClient(store.toString()).scorecard.list.query()) as Array<{ id: string; nameEn?: string }>;
    const seededMap = scorecards.find((scorecard) => scorecard.nameEn === "Corporate Strategy 2025");
    if (seededMap) scorecardId = seededMap.id;
    else if (scorecards.length > 0) scorecardId = scorecards[0]!.id;
  } catch {
    // Explicit demo fallback only when persisted scorecards cannot be resolved.
  }
  redirect(`/strategy-maps/${scorecardId}`);
}

import type { Metadata } from "next";
import StrategyHierarchyPage from "@/components/strategy/StrategyHierarchyPage";
import { auth } from "@/lib/auth/auth";
import { getCurrentAuthorization } from "@/services/iam.service";

export const metadata: Metadata = {
  title: "Strategy Hierarchy · StratAlign",
};

export default async function Page() {
  const session = await auth();
  const authorization = session?.user ? await getCurrentAuthorization() : null;
  // Matches the backend's `strategy.node.create` gate (packages/api/src/strategy.ts),
  // which requires `seo_administrator`.
  const canManageStrategy = authorization?.roles.includes("seo_administrator") ?? false;

  return <StrategyHierarchyPage canManageStrategy={canManageStrategy} />;
}

import type { Metadata } from "next";
import CanonicalStrategyHierarchyPage from "@/components/strategy/CanonicalStrategyHierarchyPage";
import { auth } from "@/lib/auth/auth";
import { getCurrentAuthorization } from "@/services/iam.service";

export const metadata: Metadata = {
  title: "Strategy Hierarchy · StratAlign",
};

export default async function Page() {
  const session = await auth();
  const authorization = session?.user ? await getCurrentAuthorization() : null;
  const canManageStrategy = authorization?.roles.includes("seo_administrator") ?? false;

  return <CanonicalStrategyHierarchyPage canManageStrategy={canManageStrategy} />;
}

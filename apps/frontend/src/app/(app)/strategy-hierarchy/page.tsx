import type { Metadata } from "next";
import StrategyHierarchyPage from "@/components/strategy/StrategyHierarchyPage";

export const metadata: Metadata = {
  title: "Strategy Hierarchy · StratAlign",
};

export default function Page() {
  return <StrategyHierarchyPage canManageStrategy />;
}

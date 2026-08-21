import type { Metadata } from "next";
import StrategyMapPage from "@/components/strategy-map/demo/StrategyMapPage";

export const metadata: Metadata = {
  title: "Strategy Map Demo · StratAlign",
};

export default function Page() {
  return <StrategyMapPage />;
}

import type { Metadata } from "next";
import StrategyMapPage from "@/components/strategy-map/StrategyMapPage";

export const metadata: Metadata = {
  title: "Strategy Maps · StratAlign",
};

export default function Page() {
  return <StrategyMapPage />;
}

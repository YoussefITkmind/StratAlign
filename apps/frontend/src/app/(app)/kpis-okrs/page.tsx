import type { Metadata } from "next";
import KpiWorkspacePage from "@/components/kpi-workspace/KpiWorkspacePage";

export const metadata: Metadata = {
  title: "KPIs & OKRs · StratAlign",
};

export default function Page() {
  return <KpiWorkspacePage />;
}

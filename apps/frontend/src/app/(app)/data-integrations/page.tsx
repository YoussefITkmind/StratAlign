import type { Metadata } from "next";
import DataIntegrationsPage from "@/components/data-integrations/DataIntegrationsPage";

export const metadata: Metadata = {
  title: "Data & Integrations · StratAlign",
};

export default function Page() {
  return <DataIntegrationsPage />;
}

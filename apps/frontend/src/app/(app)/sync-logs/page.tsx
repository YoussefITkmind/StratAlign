import type { Metadata } from "next";
import SyncLogsPage from "@/components/sync-logs/SyncLogsPage";

export const metadata: Metadata = {
  title: "Sync Logs · StratAlign",
};

export default function Page() {
  return <SyncLogsPage />;
}

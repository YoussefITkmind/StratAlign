import type { Metadata } from "next";
import { AuditClient } from "@/components/audit/audit-client";

export const metadata: Metadata = {
  title: "Audit log · StratAlign",
};

export default function AuditPage() {
  return <AuditClient />;
}

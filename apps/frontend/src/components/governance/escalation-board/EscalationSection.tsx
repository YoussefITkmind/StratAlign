"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Clock, TrendingUp, TriangleAlert } from "lucide-react";
import { mockCases, mockSummary } from "@/data/mockCases";
import { EscalationCase } from "@/types/case";
import StatCard from "./StatCard";
import FiltersBar from "./FiltersBar";
import CasesTable from "./CasesTable";

export default function EscalationSection() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [priorityFilter, setPriorityFilter] = useState("All Priorities");
  const [slaFilter, setSlaFilter] = useState("All SLA Zones");

  const [cases, setCases] = useState<EscalationCase[]>(mockCases);

  // Local state only — wiring this to a real `escalation.acknowledge` backend
  // mutation needs that procedure exposed on the frontend tRPC governance
  // router first (the backend service already supports it), which is out of
  // scope for this UI-only pass.
  const handleAcknowledge = (id: string) => {
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, status: "Acknowledged" } : c)));
  };

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "All Statuses" || c.status === statusFilter;
      const matchesPriority = priorityFilter === "All Priorities" || c.priority === priorityFilter;
      const matchesSla =
        slaFilter === "All SLA Zones" ||
        (slaFilter === "Overdue" && c.slaZone === "overdue") ||
        (slaFilter === "Near SLA" && c.slaZone === "near") ||
        (slaFilter === "On Track" && c.slaZone === "on-track");

      return matchesSearch && matchesStatus && matchesPriority && matchesSla;
    });
  }, [cases, search, statusFilter, priorityFilter, slaFilter]);

  const handleView = (id: string) => {
    // TODO: navigate to case detail once escalation cases have one (Phase 8 admin console).
    console.log("view case", id);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4">
        <StatCard icon={<ClipboardList className="h-[18px] w-[18px]" />} value={mockSummary.totalCases} label="Total Cases" tone="neutral" />
        <StatCard icon={<TriangleAlert className="h-[18px] w-[18px]" />} value={mockSummary.unacknowledged} label="Unacknowledged" tone="warning" />
        <StatCard icon={<Clock className="h-[18px] w-[18px]" />} value={mockSummary.nearSla} label="Near SLA (< 24h)" tone="info" />
        <StatCard icon={<TrendingUp className="h-[18px] w-[18px]" />} value={mockSummary.overdue} label="Overdue" tone="danger" />
      </div>

      <FiltersBar
        searchValue={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        slaFilter={slaFilter}
        onSlaFilterChange={setSlaFilter}
        resultCount={filteredCases.length}
      />

      <CasesTable cases={filteredCases} onView={handleView} onAcknowledge={handleAcknowledge} />
    </div>
  );
}

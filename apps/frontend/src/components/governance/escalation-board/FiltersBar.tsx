"use client";

import { ChevronDown, Search } from "lucide-react";

interface FiltersBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (value: string) => void;
  slaFilter: string;
  onSlaFilterChange: (value: string) => void;
  resultCount: number;
}

const STATUS_OPTIONS = ["All Statuses", "Open", "Acknowledged", "Escalated", "In Review", "Resolved"];
const PRIORITY_OPTIONS = ["All Priorities", "Critical", "High", "Medium", "Low"];
const SLA_OPTIONS = ["All SLA Zones", "Overdue", "Near SLA", "On Track"];

export default function FiltersBar({
  searchValue,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  slaFilter,
  onSlaFilterChange,
  resultCount,
}: FiltersBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 py-3">
      <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-400">
        <Search className="h-4 w-4 shrink-0" />
        <input
          type="text"
          placeholder="Search cases..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full border-none bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
      </div>

      <FilterSelect value={statusFilter} onChange={onStatusFilterChange} options={STATUS_OPTIONS} />
      <FilterSelect value={priorityFilter} onChange={onPriorityFilterChange} options={PRIORITY_OPTIONS} />
      <FilterSelect value={slaFilter} onChange={onSlaFilterChange} options={SLA_OPTIONS} />

      <span className="ms-auto whitespace-nowrap ps-2 text-sm text-gray-500">{resultCount} cases</span>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="relative flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-gray-200 bg-white py-2 ps-3 pe-7 text-sm text-gray-700"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute end-2.5 h-3 w-3 text-gray-400" />
    </div>
  );
}

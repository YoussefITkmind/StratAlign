"use client";

import { useMemo, useState } from "react";
import { Search, ChevronDown, RefreshCw, Check } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  CONNECTED: { label: "Connected", dot: "bg-emerald-500", text: "text-emerald-600" },
  ERROR: { label: "Error", dot: "bg-red-500", text: "text-red-600" },
  DISCONNECTED: { label: "Disconnected", dot: "bg-slate-400", text: "text-slate-500" },
  PENDING: { label: "Pending", dot: "bg-orange-500", text: "text-orange-600" },
};

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export default function ConnectionsTab({ search }: { search: string }) {
  const utils = trpc.useUtils();
  const query = trpc.integrations.connections.list.useQuery();
  const connections = useMemo(() => query.data ?? [], [query.data]);

  const toggleMutation = trpc.integrations.connections.toggle.useMutation({
    onSuccess: () => utils.integrations.connections.list.invalidate(),
  });
  const syncMutation = trpc.integrations.connections.syncNow.useMutation({
    onSuccess: () => utils.integrations.connections.list.invalidate(),
  });

  const [category, setCategory] = useState("All Categories");
  const [status, setStatus] = useState("All Status");
  const [catOpen, setCatOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const categories = useMemo(
    () => ["All Categories", ...Array.from(new Set(connections.map((c) => c.category)))],
    [connections]
  );
  const statuses = ["All Status", ...Object.values(STATUS_META).map((m) => m.label)];

  const filtered = connections.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "All Categories" || c.category === category;
    const matchesStatus = status === "All Status" || STATUS_META[c.status]?.label === status;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const counts = {
    Connected: connections.filter((c) => c.status === "CONNECTED").length,
    Error: connections.filter((c) => c.status === "ERROR").length,
    Disconnected: connections.filter((c) => c.status === "DISCONNECTED").length,
    Pending: connections.filter((c) => c.status === "PENDING").length,
  };

  return (
    <div>
      {/* Summary row */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> {counts.Connected} Connected
          </span>
          <span className="flex items-center gap-1.5 font-medium text-red-600">
            <span className="h-2 w-2 rounded-full bg-red-500" /> {counts.Error} Error
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-500">
            <span className="h-2 w-2 rounded-full bg-slate-400" /> {counts.Disconnected}{" "}
            Disconnected
          </span>
          <span className="flex items-center gap-1.5 font-medium text-orange-600">
            <span className="h-2 w-2 rounded-full bg-orange-500" /> {counts.Pending} Pending
          </span>
        </div>
        <span className="text-slate-400">{filtered.length} shown</span>
      </div>

      {/* Filters row */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            value={search}
            readOnly
          />
        </div>
        <Dropdown
          label={category}
          options={categories}
          open={catOpen}
          setOpen={setCatOpen}
          onSelect={setCategory}
        />
        <Dropdown
          label={status}
          options={statuses}
          open={statusOpen}
          setOpen={setStatusOpen}
          onSelect={setStatus}
        />
      </div>

      {/* Cards */}
      <div className="mt-4 flex flex-col gap-3">
        {query.isLoading && (
          <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
            Loading connections…
          </div>
        )}
        {filtered.map((c) => {
          const meta = STATUS_META[c.status];
          const syncing = syncMutation.isPending && syncMutation.variables?.id === c.id;
          return (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ${c.color}`}
                  >
                    {c.icon}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                        {c.category}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`flex items-center gap-1 font-medium ${meta.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                      <span className="rounded-md border border-slate-200 px-1.5 py-0.5 font-medium text-slate-500">
                        {c.direction}
                      </span>
                      <span className="text-slate-400">{syncing ? "Syncing…" : c.lastSync}</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => syncMutation.mutate({ id: c.id })}
                    disabled={syncing || c.status !== "CONNECTED"}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${syncing ? "animate-spin-slow" : ""}`}
                    />
                    Sync Now
                  </button>
                  <button
                    onClick={() => toggleMutation.mutate({ id: c.id })}
                    disabled={toggleMutation.isPending && toggleMutation.variables?.id === c.id}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                      c.status === "CONNECTED"
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    {c.status === "CONNECTED" ? "Disconnect" : "Connect"}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1 font-medium text-emerald-600">
                    {fmt(c.recordsIn)} records in
                  </span>
                  <span className="flex items-center gap-1 font-medium text-slate-600">
                    {fmt(c.recordsOut)} records out
                  </span>
                </div>
                <span className="text-slate-400">{c.meta}</span>
              </div>
            </div>
          );
        })}
        {!query.isLoading && filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
            No connections match your filters.
          </div>
        )}
      </div>
    </div>
  );
}

function Dropdown({
  label,
  options,
  open,
  setOpen,
  onSelect,
}: {
  label: string;
  options: string[];
  open: boolean;
  setOpen: (v: boolean) => void;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1.5 w-52 animate-fade-in rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => {
                onSelect(o);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              {o}
              {o === label && <Check className="h-3.5 w-3.5 text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, X } from "lucide-react";
import { Webhook } from "@/types/dataIntegrations";

export default function WebhooksTab({
  webhooks,
  setWebhooks,
  search,
}: {
  webhooks: Webhook[];
  setWebhooks: React.Dispatch<React.SetStateAction<Webhook[]>>;
  search: string;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState("");

  const filtered = webhooks.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.url.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = webhooks.filter((w) => w.active && w.successRate >= 90).length;
  const failingCount = webhooks.filter((w) => w.successRate < 90).length;

  function toggleActive(id: string) {
    setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, active: !w.active } : w)));
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    setWebhooks((prev) => prev.filter((w) => w.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  function addWebhook() {
    if (!newName.trim() || !newUrl.trim()) return;
    const events = newEvents
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    setWebhooks((prev) => [
      {
        id: `w${Date.now()}`,
        name: newName.trim(),
        url: newUrl.trim(),
        events: events.length ? events : ["custom.event"],
        active: true,
        successRate: 100,
      },
      ...prev,
    ]);
    setNewName("");
    setNewUrl("");
    setNewEvents("");
    setShowAdd(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Webhooks</h2>
          <div className="mt-0.5 flex items-center gap-3 text-sm text-slate-500">
            <span>HTTP callbacks triggered by platform events</span>
            <span className="flex items-center gap-1 text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {activeCount} active
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {failingCount} failing
            </span>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Add Webhook
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {filtered.map((w) => {
          const isOpen = expanded.includes(w.id);
          const failing = w.successRate < 90;
          return (
            <div key={w.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`flex items-center gap-1 text-xs font-medium ${
                        w.active ? "text-emerald-600" : "text-slate-400"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          w.active ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                      {w.active ? "Active" : "Disabled"}
                    </span>
                    {w.events.map((e) => (
                      <span
                        key={e}
                        className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-slate-900">{w.name}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-slate-400">{w.url}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-32 text-right">
                    <p className={`text-sm font-bold ${failing ? "text-red-600" : "text-emerald-600"}`}>
                      {w.successRate.toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-slate-400">success rate</p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${failing ? "bg-red-500" : "bg-emerald-500"}`}
                        style={{ width: `${w.successRate}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleActive(w.id)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {w.active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(w)}
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      title="Delete webhook"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleExpand(w.id)}
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-4">
                  <div>
                    <p className="text-slate-400">Delivery attempts (24h)</p>
                    <p className="mt-0.5 font-semibold text-slate-700">
                      {Math.round(200 + w.successRate * 3)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Avg. response time</p>
                    <p className="mt-0.5 font-semibold text-slate-700">
                      {failing ? "3.2s" : "240ms"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Signing secret</p>
                    <p className="mt-0.5 font-mono font-semibold text-slate-700">whsec_••••7f2a</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Retry policy</p>
                    <p className="mt-0.5 font-semibold text-slate-700">3 retries, backoff</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
            No webhooks match your search.
          </div>
        )}
      </div>

      {/* Add webhook modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setShowAdd(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md animate-fade-in rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-slate-900">Add webhook</p>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Name</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Forecast Update → Slack"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Endpoint URL</label>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://platform.company/webhooks/..."
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Events (comma separated)</label>
                <input
                  value={newEvents}
                  onChange={(e) => setNewEvents(e.target.value)}
                  placeholder="opportunity.won, opportunity.lost"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={addWebhook}
                disabled={!newName.trim() || !newUrl.trim()}
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
              >
                Add webhook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm animate-fade-in rounded-2xl bg-white p-5 shadow-xl"
          >
            <p className="text-base font-semibold text-slate-900">Delete {deleteTarget.name}?</p>
            <p className="mt-1.5 text-sm text-slate-500">
              This endpoint will stop receiving events immediately. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete webhook
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

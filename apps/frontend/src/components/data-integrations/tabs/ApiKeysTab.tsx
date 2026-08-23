"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy, Plus, X, Check } from "lucide-react";
import { ApiKey, ApiKeyScope } from "@/types/dataIntegrations";

const SCOPE_STYLES: Record<ApiKeyScope, string> = {
  ADMIN: "bg-orange-50 text-orange-600 border-orange-200",
  READ: "bg-emerald-50 text-emerald-600 border-emerald-200",
  WRITE: "bg-violet-50 text-violet-600 border-violet-200",
};

function mask(key: string) {
  return key.slice(0, 12) + "•".repeat(Math.max(key.length - 12, 8));
}

export default function ApiKeysTab({
  apiKeys,
  setApiKeys,
  search,
}: {
  apiKeys: ApiKey[];
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKey[]>>;
  search: string;
}) {
  const [revealed, setRevealed] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<ApiKeyScope>("READ");
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

  const filtered = apiKeys.filter((k) => k.name.toLowerCase().includes(search.toLowerCase()));

  function toggleReveal(id: string) {
    setRevealed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function copyKey(k: ApiKey) {
    navigator.clipboard?.writeText(k.key);
    setCopiedId(k.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function toggleDisable(id: string) {
    setApiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, disabled: !k.disabled } : k)));
  }

  function confirmRevoke() {
    if (!revokeTarget) return;
    setApiKeys((prev) => prev.filter((k) => k.id !== revokeTarget.id));
    setRevokeTarget(null);
  }

  function addKey() {
    if (!newName.trim()) return;
    const id = `k${Date.now()}`;
    const rand = Math.random().toString(36).slice(2, 14);
    const prefix = newScope === "ADMIN" ? "adm" : newScope === "WRITE" ? "wrt" : "rd";
    const today = new Date();
    const created = today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const expires = nextYear.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    setApiKeys((prev) => [
      {
        id,
        name: newName.trim(),
        scope: newScope,
        key: `bsc_${prefix}_sk_${rand}`,
        owner: "Alex Morgan",
        created,
        expires,
        lastUsed: "Never",
        requests: 0,
        disabled: false,
      },
      ...prev,
    ]);
    setNewName("");
    setNewScope("READ");
    setShowAdd(false);
    setRevealed((prev) => [...prev, id]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">API Keys</h2>
          <p className="text-sm text-slate-500">
            Authenticate external systems with the BSC Platform REST API
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Add new key
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {filtered.map((k) => {
          const isRevealed = revealed.includes(k.id);
          return (
            <div
              key={k.id}
              className={`rounded-xl border bg-white p-4 shadow-sm ${
                k.disabled ? "border-slate-200 opacity-60" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{k.name}</p>
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${SCOPE_STYLES[k.scope]}`}
                    >
                      {k.scope}
                    </span>
                    {k.disabled && (
                      <span className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        DISABLED
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">
                      {isRevealed ? k.key : mask(k.key)}
                    </code>
                    <button
                      onClick={() => toggleReveal(k.id)}
                      className="text-slate-400 hover:text-slate-600"
                      title={isRevealed ? "Hide key" : "Show key"}
                    >
                      {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => copyKey(k)}
                      className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {copiedId === k.id ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copiedId === k.id ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => toggleDisable(k.id)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {k.disabled ? "Enable" : "Disable"}
                  </button>
                  <button
                    onClick={() => setRevokeTarget(k)}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    Revoke
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-400">
                <div className="flex flex-wrap items-center gap-4">
                  <span>
                    Owner: <span className="text-slate-600">{k.owner}</span>
                  </span>
                  <span>
                    Created: <span className="text-slate-600">{k.created}</span>
                  </span>
                  <span>
                    Expires: <span className="text-slate-600">{k.expires}</span>
                  </span>
                  <span>
                    Last used: <span className="text-slate-600">{k.lastUsed}</span>
                  </span>
                </div>
                <span className="font-medium text-slate-500">
                  {k.requests.toLocaleString("en-US")} requests
                </span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
            No API keys match your search.
          </div>
        )}
      </div>

      {/* Add key modal */}
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
              <p className="text-base font-semibold text-slate-900">Add new key</p>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Key name</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Mobile App – Production"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Scope</label>
                <div className="mt-1 flex gap-2">
                  {(["READ", "WRITE", "ADMIN"] as ApiKeyScope[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setNewScope(s)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                        newScope === s
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
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
                onClick={addKey}
                disabled={!newName.trim()}
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
              >
                Create key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirm modal */}
      {revokeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setRevokeTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm animate-fade-in rounded-2xl bg-white p-5 shadow-xl"
          >
            <p className="text-base font-semibold text-slate-900">Revoke {revokeTarget.name}?</p>
            <p className="mt-1.5 text-sm text-slate-500">
              Any system using this key will immediately lose access. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setRevokeTarget(null)}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRevoke}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Revoke key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

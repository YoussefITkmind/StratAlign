"use client";

import { useState } from "react";
import { X, Sparkles, RefreshCw, Trash2 } from "lucide-react";
import { StrategyNode, NodeType, NodeStatus } from "@/types/strategy";
import { TYPE_CONFIG, STATUS_CONFIG, colorForInitials } from "@/lib/strategyConfig";
import { flatten } from "@/lib/treeUtils";

interface Props {
  tree: StrategyNode;
  defaultParentId: string;
  onClose: () => void;
  onAdd: (parentId: string, node: StrategyNode) => void;
}

export default function AddNodeModal({ tree, defaultParentId, onClose, onAdd }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<NodeType>("initiative");
  const [status, setStatus] = useState<NodeStatus>("not-started");
  const [progress, setProgress] = useState(0);
  const [owner, setOwner] = useState("");
  const [parentId, setParentId] = useState(defaultParentId);
  const [description, setDescription] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);

  const allNodes = flatten(tree);

  const handleDraftDescription = async () => {
    if (!name.trim()) return;
    setIsDrafting(true);
    try {
      const parentNode = allNodes.find(n => n.node.id === parentId)?.node;
      const res = await fetch("/api/ai/draft-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          context: { parentName: parentNode?.name }
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDescription(data.draft);
        setIsGenerated(true);
      }
    } catch (e) {
      console.error("Failed to generate description", e);
    } finally {
      setIsDrafting(false);
    }
  };

  const submit = () => {
    if (!name.trim() || !owner.trim()) return;
    const newNode: StrategyNode = {
      id: `node-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      status,
      progress: Math.min(100, Math.max(0, progress)),
      owner: { initials: owner.trim().toUpperCase().slice(0, 2), color: colorForInitials(owner) },
    };
    onAdd(parentId, newNode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl overflow-y-auto max-h-[90vh]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add Node</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Improve Customer NPS"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as NodeType)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Parent</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {allNodes.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {"— ".repeat(depth)}{node.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Description</label>
              {!isGenerated ? (
                <button
                  type="button"
                  onClick={handleDraftDescription}
                  disabled={!name.trim() || isDrafting}
                  className="flex items-center gap-1.5 rounded bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                >
                  {isDrafting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {isDrafting ? "Drafting..." : "Draft with AI"}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDraftDescription}
                    disabled={isDrafting}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${isDrafting ? 'animate-spin' : ''}`} />
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDescription(""); setIsGenerated(false); }}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-3 w-3" />
                    Reject
                  </button>
                </div>
              )}
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter a description..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Owner initials</label>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="e.g. JD"
                maxLength={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as NodeStatus)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Progress ({progress}%)</label>
            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || !owner.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add Node
          </button>
        </div>
      </div>
    </div>
  );
}

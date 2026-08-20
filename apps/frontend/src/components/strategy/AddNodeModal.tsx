"use client";

import { useState } from "react";
import { X } from "lucide-react";
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

  const allNodes = flatten(tree);

  const submit = () => {
    if (!name.trim() || !owner.trim()) return;
    const newNode: StrategyNode = {
      id: `node-${Date.now()}`,
      name: name.trim(),
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
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
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

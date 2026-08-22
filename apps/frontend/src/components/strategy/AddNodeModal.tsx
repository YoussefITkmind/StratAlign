"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { StrategyNode, NodeType, NodeStatus } from "@/types/strategy";
import { TYPE_CONFIG, STATUS_CONFIG } from "@/lib/strategyConfig";
import { flatten } from "@/lib/treeUtils";

export interface NodeFormValues {
  name: string;
  type: NodeType;
  status: NodeStatus;
  progress: number;
  ownerName: string;
  budget: string;
  startDate: string;
  endDate: string;
  description: string;
  linkedKpis: string[];
}

interface Props {
  tree: StrategyNode;
  defaultParentId: string;
  editNode?: StrategyNode;
  onClose: () => void;
  onAdd: (parentId: string, data: NodeFormValues) => Promise<void>;
  onEdit: (id: string, data: NodeFormValues) => Promise<void>;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
const labelClass = "mb-1 block text-sm font-medium text-gray-700";

export default function AddNodeModal({ tree, defaultParentId, editNode, onClose, onAdd, onEdit }: Props) {
  const isEdit = !!editNode;

  const [name, setName] = useState(editNode?.name ?? "");
  const [type, setType] = useState<NodeType>(editNode?.type ?? "initiative");
  const [status, setStatus] = useState<NodeStatus>(editNode?.status ?? "not-started");
  const [progress, setProgress] = useState(editNode?.progress ?? 0);
  const [ownerName, setOwnerName] = useState(editNode?.owner.name ?? "");
  const [parentId, setParentId] = useState(defaultParentId);
  const [budget, setBudget] = useState(editNode?.budget ?? "");
  const [startDate, setStartDate] = useState(editNode?.startDate?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(editNode?.endDate?.slice(0, 10) ?? "");
  const [description, setDescription] = useState(editNode?.description ?? "");
  const [linkedKpis, setLinkedKpis] = useState((editNode?.linkedKpis ?? []).join(", "));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allNodes = flatten(tree);

  const submit = async () => {
    if (!name.trim() || !ownerName.trim()) return;
    setSubmitting(true);
    setError(null);

    const data: NodeFormValues = {
      name: name.trim(),
      type,
      status,
      progress: Math.min(100, Math.max(0, Math.round(progress))),
      ownerName: ownerName.trim(),
      budget: budget.trim(),
      startDate,
      endDate,
      description: description.trim(),
      linkedKpis: linkedKpis
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    };

    try {
      if (isEdit) {
        await onEdit(editNode!.id, data);
      } else {
        await onAdd(parentId, data);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div data-testid="node-form-modal" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? "Edit Node" : "Add Node"}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Improve Customer NPS"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as NodeType)} className={inputClass}>
                {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            {isEdit ? (
              <div>
                <label className={labelClass}>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as NodeStatus)} className={inputClass}>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className={labelClass}>Parent</label>
                <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputClass}>
                  {allNodes.map(({ node, depth }) => (
                    <option key={node.id} value={node.id}>
                      {"— ".repeat(depth)}{node.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Owner name</label>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Jane Doe"
                className={inputClass}
              />
            </div>
            {isEdit ? (
              <div>
                <label className={labelClass}>Budget</label>
                <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. $500K" className={inputClass} />
              </div>
            ) : (
              <div>
                <label className={labelClass}>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as NodeStatus)} className={inputClass}>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
            </div>
          </div>

          {!isEdit && (
            <div>
              <label className={labelClass}>Budget</label>
              <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. $500K" className={inputClass} />
            </div>
          )}

          <div>
            <label className={labelClass}>Progress ({progress}%)</label>
            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What is this node about?"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Linked KPIs</label>
            <input
              value={linkedKpis}
              onChange={(e) => setLinkedKpis(e.target.value)}
              placeholder="e.g. Revenue Growth, Strategy Score"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">Comma-separated</p>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || !ownerName.trim() || submitting}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Node"}
          </button>
        </div>
      </div>
    </div>
  );
}

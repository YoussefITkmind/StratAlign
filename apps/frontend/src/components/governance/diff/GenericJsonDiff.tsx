import type { DiffRendererProps } from "./types";

function flatten(value: unknown, prefix = ""): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { [prefix || "value"]: value };
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      Object.assign(out, flatten(val, path));
    } else {
      out[path] = val;
    }
  }
  return out;
}

function display(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

/**
 * Fallback renderer for any entity type without a dedicated renderer
 * registered below — a flat key/value before/after diff so no case type is
 * ever left with nothing to show, satisfying the extensible-registry
 * requirement without a bespoke component per entity.
 */
export default function GenericJsonDiff({ before, after }: DiffRendererProps) {
  const beforeFlat = flatten(before);
  const afterFlat = flatten(after);
  const keys = [...new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)])].sort();

  if (keys.length === 0) {
    return <p className="text-xs text-gray-400">No proposed change data.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400">
            <th className="py-1 pr-3 font-medium">Field</th>
            <th className="py-1 pr-3 font-medium">Before</th>
            <th className="py-1 font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const changed = beforeFlat[key] !== afterFlat[key];
            return (
              <tr key={key} className="border-t border-gray-100">
                <td className="py-1 pr-3 font-mono text-gray-500">{key}</td>
                <td className={`py-1 pr-3 ${changed ? "text-red-600 line-through" : "text-gray-600"}`}>{display(beforeFlat[key])}</td>
                <td className={`py-1 ${changed ? "font-medium text-emerald-700" : "text-gray-600"}`}>{display(afterFlat[key])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

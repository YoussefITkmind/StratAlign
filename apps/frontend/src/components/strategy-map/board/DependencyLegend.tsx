import { DEPENDENCY_ORDER, DEPENDENCY_CONFIG } from "@/lib/mapConfig";
import { DependencyType } from "@/types/strategyMap";

interface Props {
  visibleTypes: Set<DependencyType>;
  onToggle: (type: DependencyType) => void;
}

export default function DependencyLegend({ visibleTypes, onToggle }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {DEPENDENCY_ORDER.map((type) => {
        const cfg = DEPENDENCY_CONFIG[type];
        const on = visibleTypes.has(type);
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            className="flex items-center gap-1.5 text-xs font-medium transition-opacity"
            style={{ opacity: on ? 1 : 0.35 }}
          >
            <span
              className="h-0.5 w-5 rounded-full"
              style={{ background: cfg.color, borderTop: cfg.dashed ? `2px dashed ${cfg.color}` : undefined, height: cfg.dashed ? 0 : 2 }}
            />
            <span className="text-gray-600">{cfg.label}</span>
          </button>
        );
      })}
    </div>
  );
}

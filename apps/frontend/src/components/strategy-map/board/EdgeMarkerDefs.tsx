import { DEPENDENCY_ORDER, DEPENDENCY_CONFIG } from "@/lib/mapConfig";

export default function EdgeMarkerDefs() {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        {DEPENDENCY_ORDER.map((type) => (
          <marker
            key={type}
            id={`strategy-board-arrow-${type}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={DEPENDENCY_CONFIG[type].color} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}

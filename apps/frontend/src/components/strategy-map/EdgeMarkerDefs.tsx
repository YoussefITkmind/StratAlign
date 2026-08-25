import { LINK_CONFIG, type LinkStrength } from "@/lib/strategyMapVisualConfig";

const LINK_TYPES: LinkStrength[] = ["weak", "strong", "enables", "impacts", "drives", "supports"];

export default function EdgeMarkerDefs() {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        {LINK_TYPES.map((strength) => (
          <marker
            key={strength}
            id={`strategy-map-arrow-${strength}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={LINK_CONFIG[strength].color} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}

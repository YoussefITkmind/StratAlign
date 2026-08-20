import { Plus, Minus } from "lucide-react";
import { useReactFlow } from "@xyflow/react";

export default function ZoomControls({ zoomPct }: { zoomPct: number }) {
  const { zoomIn, zoomOut } = useReactFlow();

  return (
    <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1.5 shadow-sm">
      <button onClick={() => zoomIn({ duration: 150 })} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100" title="Zoom in">
        <Plus className="h-3.5 w-3.5" />
      </button>
      <span className="w-9 text-center text-xs font-medium text-gray-500">{zoomPct}%</span>
      <button onClick={() => zoomOut({ duration: 150 })} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100" title="Zoom out">
        <Minus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

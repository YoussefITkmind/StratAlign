import { Objective } from "@/types/strategyMap";

/**
 * Objectives that exist in the (mock) registry but aren't placed on a given
 * map yet — the pool an analyst picks from via "Add existing objective" in
 * edit mode (screen 13). Real data would come from Prompt 3.1's registry;
 * this is a frontend-only stand-in (see EditableMapCanvas for context).
 */
export const unplacedObjectivePool: Record<string, Objective[]> = {
  "map-corporate": [
    { id: "obj-pricing-strategy", title: "Refresh Pricing Strategy", perspective: "financial", owner: "Alex Morgan", score: 51, column: 3 },
    { id: "obj-support-response-time", title: "Cut Support Response Time", perspective: "customer", owner: "Priya Nair", score: 69, column: 3 },
    { id: "obj-vendor-consolidation", title: "Consolidate Key Vendors", perspective: "internal-process", owner: "Sam Whitfield", score: 47, column: 2 },
  ],
  "map-emea-expansion": [
    { id: "obj-emea-localization", title: "Localize Product for EMEA", perspective: "internal-process", owner: "Sam Whitfield", score: 38, column: 1 },
  ],
};

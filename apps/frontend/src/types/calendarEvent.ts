/**
 * A rendered instance of a cadence definition (Prompt 1.6's scheduler) on the review
 * calendar. `type` links to CADENCE_EVENT_TYPES for label/color; the entity a cadence
 * pertains to has no dedicated detail view yet, so `title` is a generic label until
 * Phase 7 builds business-specific cadence content (e.g. EXCO review packs).
 */
export interface CadenceEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time: string;
  title: string;
  type: string;
}

export interface CadenceEventTypeMeta {
  type: string;
  label: string;
  dot: string;
  badgeClass: string;
}

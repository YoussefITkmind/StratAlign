import { describe, expect, it } from "vitest";

import {
  MAX_BRIEF_ITEMS,
  selectSignificantItems,
} from "../../src/modules/ai/audio-brief.significance";
import type {
  AudioBriefSignals,
  InitiativeSignal,
  KpiSignal,
  OkrSignal,
} from "../../src/modules/ai/audio-brief.types";

/**
 * This module is the deterministic gate between real report data and the
 * LLM: everything the model is allowed to see comes from here. These tests
 * hold the ranking rules directly, without a provider in the loop.
 */

function kpi(overrides: Partial<KpiSignal> = {}): KpiSignal {
  return {
    kpiDefinitionId: "kpi-1",
    nameEn: "Revenue Growth",
    unit: "%",
    polarity: "higher_is_better",
    status: "on_track",
    actual: 100,
    target: 100,
    delta: null,
    ...overrides,
  };
}

function okr(overrides: Partial<OkrSignal> = {}): OkrSignal {
  return {
    okrId: "okr-1",
    nameEn: "Expand market share",
    keyResults: [{ titleEn: "Grow enterprise accounts", progressPercent: 80 }],
    ...overrides,
  };
}

function initiative(overrides: Partial<InitiativeSignal> = {}): InitiativeSignal {
  return {
    initiativeId: "initiative-1",
    nameEn: "Digital transformation",
    status: "on_track",
    ...overrides,
  };
}

const emptySignals: AudioBriefSignals = { kpis: [], okrs: [], initiatives: [] };

describe("selectSignificantItems", () => {
  it("returns nothing when there is no meaningful data", () => {
    expect(selectSignificantItems(emptySignals)).toEqual([]);
  });

  it("prioritises an off-track KPI as critical", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      kpis: [kpi({ status: "off_track", actual: 82, target: 100 })],
    });

    expect(items).toEqual([
      expect.objectContaining({ type: "kpi", importance: "critical", name: "Revenue Growth" }),
    ]);
  });

  it("includes a watch-status KPI as medium importance", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      kpis: [kpi({ status: "watch", actual: 94, target: 100 })],
    });

    expect(items).toEqual([
      expect.objectContaining({ type: "kpi", importance: "medium" }),
    ]);
  });

  it("prioritises an off-track initiative as critical", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      initiatives: [initiative({ status: "off_track", nameEn: "Digital transformation" })],
    });

    expect(items).toEqual([
      expect.objectContaining({
        type: "initiative",
        importance: "critical",
        name: "Digital transformation",
      }),
    ]);
  });

  it("includes an at-risk initiative as medium importance", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      initiatives: [initiative({ status: "at_risk" })],
    });

    expect(items).toEqual([
      expect.objectContaining({ type: "initiative", importance: "medium" }),
    ]);
  });

  it("ignores an on-track initiative", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      initiatives: [initiative({ status: "on_track" })],
    });

    expect(items).toEqual([]);
  });

  it("flags a large unfavourable KPI change even when status is on_track", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      kpis: [
        kpi({
          status: "on_track",
          polarity: "higher_is_better",
          actual: 80,
          delta: -20, // prior value was 100 -> a 20% unfavourable drop
          target: null,
        }),
      ],
    });

    expect(items).toEqual([
      expect.objectContaining({ type: "kpi", importance: "medium" }),
    ]);
  });

  it("does not flag a small change below the significance threshold", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      kpis: [
        kpi({
          status: "on_track",
          polarity: "higher_is_better",
          actual: 101,
          delta: 1, // prior 100 -> ~1% move, and it is favourable anyway
          target: null,
        }),
      ],
    });

    expect(items).toEqual([]);
  });

  it("includes a KPI comfortably beating target as a positive achievement", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      kpis: [
        kpi({
          status: "on_track",
          polarity: "higher_is_better",
          actual: 120,
          target: 100,
          delta: null,
        }),
      ],
    });

    expect(items).toEqual([
      expect.objectContaining({ type: "kpi", importance: "positive" }),
    ]);
  });

  it("flags an OKR key result with significant progress problems", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      okrs: [okr({ keyResults: [{ titleEn: "Grow enterprise accounts", progressPercent: 15 }] })],
    });

    expect(items).toEqual([
      expect.objectContaining({ type: "okr", importance: "critical" }),
    ]);
  });

  it("flags a nearly-complete OKR key result as a positive achievement", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      okrs: [okr({ keyResults: [{ titleEn: "Grow enterprise accounts", progressPercent: 95 }] })],
    });

    expect(items).toEqual([
      expect.objectContaining({ type: "okr", importance: "positive" }),
    ]);
  });

  it("ignores a key result with no progress data yet", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      okrs: [okr({ keyResults: [{ titleEn: "Grow enterprise accounts", progressPercent: null }] })],
    });

    expect(items).toEqual([]);
  });

  it("ranks critical items ahead of medium items, and both ahead of positive items", () => {
    const items = selectSignificantItems({
      kpis: [
        kpi({ nameEn: "Positive KPI", status: "on_track", actual: 130, target: 100 }),
        kpi({ nameEn: "Critical KPI", status: "off_track", actual: 60, target: 100 }),
      ],
      okrs: [],
      initiatives: [initiative({ nameEn: "At-risk initiative", status: "at_risk" })],
    });

    expect(items.map((item) => item.importance)).toEqual(["critical", "medium", "positive"]);
  });

  it("caps positive items separately so good news cannot crowd out what needs attention", () => {
    const manyPositiveKpis = Array.from({ length: 5 }, (_, index) =>
      kpi({ nameEn: `Positive KPI ${index}`, status: "on_track", actual: 150, target: 100 }),
    );

    const items = selectSignificantItems({ ...emptySignals, kpis: manyPositiveKpis });

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.importance === "positive")).toBe(true);
  });

  it("caps the total number of selected items", () => {
    const manyCriticalInitiatives = Array.from({ length: MAX_BRIEF_ITEMS + 5 }, (_, index) =>
      initiative({ initiativeId: `initiative-${index}`, nameEn: `Initiative ${index}`, status: "off_track" }),
    );

    const items = selectSignificantItems({ ...emptySignals, initiatives: manyCriticalInitiatives });

    expect(items.length).toBeLessThanOrEqual(MAX_BRIEF_ITEMS);
  });

  it("never selects an on-track KPI with no notable change or target", () => {
    const items = selectSignificantItems({
      ...emptySignals,
      kpis: [kpi({ status: "on_track", actual: 100, target: 100, delta: null })],
    });

    expect(items).toEqual([]);
  });
});

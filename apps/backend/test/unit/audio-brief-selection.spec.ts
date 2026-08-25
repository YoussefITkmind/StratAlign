import { describe, expect, it } from "vitest";

import {
  MAX_BRIEF_SIGNALS,
  MAX_POSITIVE_SIGNALS,
  selectInitiativeSignals,
  selectKpiSignals,
  selectOkrSignals,
  selectSignificantSignals,
} from "../../src/modules/ai/audio-brief.selection";
import type {
  BriefInitiativeSnapshot,
  BriefKpiSnapshot,
  BriefOkrSnapshot,
} from "../../src/modules/ai/audio-brief.types";

/**
 * Significance selection decides what an executive is told, without a model
 * and without a network call. These tests are therefore the specification for
 * that decision: a change in what counts as significant has to show up here
 * before it can show up in a briefing.
 */

function kpi(overrides: Partial<BriefKpiSnapshot> = {}): BriefKpiSnapshot {
  return {
    id: "kpi-1",
    name: "Revenue Growth",
    unit: "%",
    polarity: "higher_is_better",
    status: "on_track",
    actual: 100,
    target: 100,
    previous: 100,
    period: "2026-Q1",
    ...overrides,
  };
}

function okr(overrides: Partial<BriefOkrSnapshot> = {}): BriefOkrSnapshot {
  return {
    id: "okr-1",
    name: "Grow the core business",
    progressPercent: 80,
    keyResultCount: 3,
    ...overrides,
  };
}

function initiative(
  overrides: Partial<BriefInitiativeSnapshot> = {},
): BriefInitiativeSnapshot {
  return {
    id: "init-1",
    name: "Billing platform migration",
    stage: "execute",
    status: "on_track",
    confidence: "high",
    ...overrides,
  };
}

describe("Audio brief significance selection — KPIs", () => {
  it("selects an off-track KPI as critical", () => {
    const [signal] = selectKpiSignals([kpi({ status: "off_track" })]);

    expect(signal.severity).toBe("critical");
    expect(signal.kind).toBe("kpi");
    expect(signal.headline).toBe("KPI is off track");
  });

  it("selects an at-risk KPI as a warning, below any off-track KPI", () => {
    const signals = selectKpiSignals([
      kpi({ id: "watch", status: "watch" }),
      kpi({ id: "off", status: "off_track" }),
    ]);

    expect(signals.map((signal) => signal.severity)).toEqual(["warning", "critical"]);
    expect(selectSignificantSignals({ kpis: [kpi({ id: "watch", status: "watch" }), kpi({ id: "off", status: "off_track" })], okrs: [], initiatives: [] })[0].id).toBe("off");
  });

  it("selects a healthy KPI that moved significantly in the wrong direction", () => {
    const [signal] = selectKpiSignals([
      kpi({ status: "on_track", previous: 100, actual: 80, target: 80 }),
    ]);

    expect(signal.severity).toBe("warning");
    expect(signal.headline).toBe("KPI moved significantly in the wrong direction");
    expect(signal.detail).toContain("down 20% versus the prior period");
  });

  it("reads a significant move against a lower_is_better KPI's polarity as adverse", () => {
    const [signal] = selectKpiSignals([
      kpi({ polarity: "lower_is_better", previous: 100, actual: 130, target: 130 }),
    ]);

    expect(signal.severity).toBe("warning");
    expect(signal.headline).toBe("KPI moved significantly in the wrong direction");
  });

  it("selects a healthy KPI sitting materially below target", () => {
    const [signal] = selectKpiSignals([
      kpi({ status: "on_track", actual: 80, target: 100, previous: 80 }),
    ]);

    expect(signal.severity).toBe("warning");
    expect(signal.headline).toBe("KPI is below its target");
  });

  it("selects a significant improvement as a positive achievement", () => {
    const [signal] = selectKpiSignals([
      kpi({ status: "on_track", previous: 100, actual: 130, target: 100 }),
    ]);

    expect(signal.severity).toBe("positive");
    expect(signal.headline).toBe("KPI improved significantly");
  });

  it("ignores a healthy KPI that barely moved and is on target", () => {
    expect(selectKpiSignals([kpi({ previous: 100, actual: 102, target: 100 })])).toEqual([]);
  });

  it("does not report a relative change when the prior period was zero", () => {
    const [signal] = selectKpiSignals([
      kpi({ status: "off_track", previous: 0, actual: 5, target: 20 }),
    ]);

    expect(signal.detail).not.toContain("versus the prior period");
  });

  it("ignores an unknown-status KPI with no target and no history", () => {
    expect(
      selectKpiSignals([kpi({ status: "unknown", target: null, previous: null })]),
    ).toEqual([]);
  });
});

describe("Audio brief significance selection — OKRs", () => {
  it("selects a low-progress objective as critical", () => {
    const [signal] = selectOkrSignals([okr({ progressPercent: 12 })]);

    expect(signal.severity).toBe("critical");
    expect(signal.headline).toBe("Objective has low progress");
    expect(signal.detail).toContain("progress 12%");
  });

  it("selects an objective that is falling behind as a warning", () => {
    const [signal] = selectOkrSignals([okr({ progressPercent: 55 })]);

    expect(signal.severity).toBe("warning");
    expect(signal.headline).toBe("Objective is falling behind");
  });

  it("selects a near-complete objective as a positive achievement", () => {
    const [signal] = selectOkrSignals([okr({ progressPercent: 95 })]);

    expect(signal.severity).toBe("positive");
  });

  it("ignores an objective with an unremarkable progress figure", () => {
    expect(selectOkrSignals([okr({ progressPercent: 80 })])).toEqual([]);
  });

  it("ignores an objective whose key results report no progress at all", () => {
    expect(selectOkrSignals([okr({ progressPercent: null })])).toEqual([]);
  });

  it("ranks a lower-progress objective ahead of a higher one at the same severity", () => {
    const signals = selectOkrSignals([
      okr({ id: "a", progressPercent: 30 }),
      okr({ id: "b", progressPercent: 10 }),
    ]);
    const ordered = selectSignificantSignals({ kpis: [], okrs: [okr({ id: "a", progressPercent: 30 }), okr({ id: "b", progressPercent: 10 })], initiatives: [] });

    expect(signals).toHaveLength(2);
    expect(ordered.map((signal) => signal.id)).toEqual(["b", "a"]);
  });
});

describe("Audio brief significance selection — initiatives", () => {
  it("selects an off-track initiative as critical", () => {
    const [signal] = selectInitiativeSignals([initiative({ status: "off_track" })]);

    expect(signal.severity).toBe("critical");
    expect(signal.headline).toBe("Initiative is off track");
  });

  it("selects an at-risk initiative as a warning", () => {
    const [signal] = selectInitiativeSignals([initiative({ status: "at_risk" })]);

    expect(signal.severity).toBe("warning");
  });

  it("ranks a low-confidence at-risk initiative above a confident one", () => {
    const ordered = selectSignificantSignals({
      kpis: [],
      okrs: [],
      initiatives: [
        initiative({ id: "confident", status: "at_risk", confidence: "high" }),
        initiative({ id: "shaky", status: "at_risk", confidence: "low" }),
      ],
    });

    expect(ordered.map((signal) => signal.id)).toEqual(["shaky", "confident"]);
  });

  it("ignores an on-track initiative and one with no status yet", () => {
    expect(
      selectInitiativeSignals([
        initiative({ status: "on_track" }),
        initiative({ id: "init-2", status: null, confidence: null }),
      ]),
    ).toEqual([]);
  });
});

describe("Audio brief significance selection — the whole pipeline", () => {
  it("returns nothing when there is no meaningful data", () => {
    expect(selectSignificantSignals({ kpis: [], okrs: [], initiatives: [] })).toEqual([]);
  });

  it("returns nothing when everything is healthy and unremarkable", () => {
    const selected = selectSignificantSignals({
      kpis: [kpi()],
      okrs: [okr({ progressPercent: 75 })],
      initiatives: [initiative()],
    });

    expect(selected).toEqual([]);
  });

  it("orders critical items ahead of warnings and warnings ahead of achievements", () => {
    const selected = selectSignificantSignals({
      kpis: [
        kpi({ id: "good", status: "on_track", previous: 100, actual: 140, target: 100 }),
        kpi({ id: "bad", status: "off_track" }),
        kpi({ id: "risky", status: "watch" }),
      ],
      okrs: [],
      initiatives: [],
    });

    expect(selected.map((signal) => signal.id)).toEqual(["bad", "risky", "good"]);
  });

  it("bounds the result at MAX_BRIEF_SIGNALS however much is wrong", () => {
    const selected = selectSignificantSignals({
      kpis: Array.from({ length: 20 }, (_, index) =>
        kpi({ id: `kpi-${index}`, status: "off_track" }),
      ),
      okrs: Array.from({ length: 20 }, (_, index) =>
        okr({ id: `okr-${index}`, progressPercent: 5 }),
      ),
      initiatives: Array.from({ length: 20 }, (_, index) =>
        initiative({ id: `init-${index}`, status: "off_track" }),
      ),
      });

    expect(selected).toHaveLength(MAX_BRIEF_SIGNALS);
    expect(selected.every((signal) => signal.severity === "critical")).toBe(true);
  });

  it("caps how much of the brief good news may occupy", () => {
    const selected = selectSignificantSignals({
      kpis: [],
      okrs: Array.from({ length: 8 }, (_, index) =>
        okr({ id: `okr-${index}`, progressPercent: 99 }),
      ),
      initiatives: [],
    });

    expect(selected).toHaveLength(MAX_POSITIVE_SIGNALS);
  });

  it("is deterministic: identical input yields an identical ordering", () => {
    const snapshot = {
      kpis: [kpi({ id: "b", status: "off_track" }), kpi({ id: "a", status: "off_track" })],
      okrs: [okr({ id: "c", progressPercent: 10 })],
      initiatives: [initiative({ id: "d", status: "at_risk" })],
    };

    expect(selectSignificantSignals(snapshot)).toEqual(selectSignificantSignals(snapshot));
  });
});

import { describe, expect, it } from "vitest";

import { applyReview, countsAfter, FRESH_STATE } from "./index";

const now = new Date("2026-09-14T10:00:00Z");
const day = 86_400_000;
const model = { halfLifeAfter: 10, version: 1 };

describe("applyReview", () => {
  it("classic follows SM-2: 1, 6, then ease-scaled days", () => {
    let s = FRESH_STATE;
    const gaps: number[] = [];
    for (let i = 0; i < 3; i++) {
      const out = applyReview(s, { remembered: true, reviewedAt: now, responseMs: 900 }, "classic", 0.9, model);
      gaps.push(out.intervalDays);
      s = out.state;
    }
    expect(gaps).toEqual([1, 6, 15]);
    expect(s.seen).toBe(3);
    expect(s.correct).toBe(3);
    expect(s.dueAt?.getTime()).toBe(now.getTime() + 15 * day);
    expect(s.halfLifeDays).toBe(10); // the model's view is stored either way
    expect(s.scheduler).toBe("classic");
  });

  it("classic lapse goes back to one day and lowers ease", () => {
    let s = FRESH_STATE;
    for (let i = 0; i < 3; i++) {
      s = applyReview(s, { remembered: true, reviewedAt: now, responseMs: null }, "classic", 0.9, model).state;
    }
    const out = applyReview(s, { remembered: false, reviewedAt: now, responseMs: null }, "classic", 0.9, model);
    expect(out.intervalDays).toBe(1);
    expect(out.state.sm2Ease).toBeCloseTo(2.3, 12);
    expect(out.state.wrong).toBe(1);
  });

  it("halflife schedules for the target retention with a one-day floor", () => {
    const out = applyReview(FRESH_STATE, { remembered: true, reviewedAt: now, responseMs: null }, "halflife", 0.9, model);
    expect(out.intervalDays).toBeCloseTo(10 * Math.log2(1 / 0.9), 12);
    const floored = applyReview(FRESH_STATE, { remembered: true, reviewedAt: now, responseMs: null }, "halflife", 0.9, { halfLifeAfter: 0.5, version: 1 });
    expect(floored.intervalDays).toBe(1);
  });

  it("keeps the first-seen date and sm2 state across scheduler switches", () => {
    const first = applyReview(FRESH_STATE, { remembered: true, reviewedAt: now, responseMs: null }, "halflife", 0.9, model).state;
    const later = new Date(now.getTime() + 3 * day);
    const second = applyReview(first, { remembered: true, reviewedAt: later, responseMs: null }, "classic", 0.9, model);
    expect(second.state.firstSeenAt).toEqual(now);
    expect(second.intervalDays).toBe(6); // sm2 advanced while halflife was scheduling
  });

  it("countsAfter", () => {
    expect(countsAfter({ ...FRESH_STATE, seen: 4, correct: 3 }, false)).toEqual({ seen: 5, correct: 3 });
  });
});

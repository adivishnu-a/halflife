/**
 * The TypeScript half of the parity test. ml/tests/test_export.py is the
 * Python half. Both read model/parity_fixtures.json, which ml/export.py wrote
 * from the shipped weights, and must agree to six decimal places.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { featurize, halfLife, MAX_HALF_LIFE, MIN_HALF_LIFE, nextIntervalDays, predict, recall } from "./hlr";
import type { Weights } from "./hlr";

interface Fixtures {
  weights: string;
  cases: Array<{
    seen: number;
    correct: number;
    days_since_first: number;
    response_ms: number;
    delta_days: number;
    target_retention: number;
    features: number[];
    half_life_days: number;
    p: number;
    next_interval_days: number;
  }>;
}

const fixtures = JSON.parse(readFileSync("model/parity_fixtures.json", "utf8")) as Fixtures;
const weights = JSON.parse(readFileSync(`model/${fixtures.weights}`, "utf8")) as Weights;

describe("parity with ml/features.py", () => {
  for (const c of fixtures.cases) {
    it(`seen ${c.seen}, correct ${c.correct}, gap ${c.delta_days} days`, () => {
      const out = predict(
        weights,
        { seen: c.seen, correct: c.correct, daysSinceFirst: c.days_since_first, responseMs: c.response_ms },
        c.delta_days,
        c.target_retention,
      );
      expect(out.features).toHaveLength(c.features.length);
      for (let i = 0; i < c.features.length; i++) {
        expect(out.features[i]).toBeCloseTo(c.features[i]!, 9);
      }
      expect(out.halfLifeDays).toBeCloseTo(c.half_life_days, 6);
      expect(out.p).toBeCloseTo(c.p, 6);
      expect(out.nextIntervalDays).toBeCloseTo(c.next_interval_days, 6);
    });
  }
});

describe("arithmetic", () => {
  it("features by hand", () => {
    const x = featurize(
      { seen: 3, correct: 3, daysSinceFirst: Math.E - 1, responseMs: 1000 * (Math.E - 1) },
      ["bias", "sqrt_seen", "sqrt_correct", "sqrt_wrong", "log_days_since_first", "log_response_s"],
    );
    expect(x).toEqual([1, 2, 2, 1, expect.closeTo(1, 12), expect.closeTo(1, 12)]);
  });

  it("optional features are inert when missing", () => {
    const x = featurize({ seen: 10, correct: 7 }, ["log_days_since_first", "log_response_s"]);
    expect(x).toEqual([0, 0]);
  });

  it("rejects correct above seen", () => {
    expect(() => featurize({ seen: 1, correct: 2 }, ["bias"])).toThrow(RangeError);
  });

  it("half-life is bounded", () => {
    expect(halfLife([1], [-100])).toBe(MIN_HALF_LIFE);
    expect(halfLife([1], [100])).toBe(MAX_HALF_LIFE);
  });

  it("recall after the next interval equals the target", () => {
    const h = 10;
    expect(recall(h, nextIntervalDays(h, 0.9))).toBeCloseTo(0.9, 12);
  });
});

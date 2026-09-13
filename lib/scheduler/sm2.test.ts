import { describe, expect, it } from "vitest";

import { forgot, initialState, remembered } from "./sm2";

describe("sm2", () => {
  it("follows the interval sequence from ml/tests/test_baselines.py", () => {
    let s = remembered(initialState());
    expect(s.interval).toBe(1);
    s = remembered(s);
    expect(s.interval).toBe(6);
    s = remembered(s);
    expect(s.interval).toBe(15); // round(6 * 2.5)
    s = forgot(s);
    expect(s).toEqual({ reps: 0, interval: 1, ease: expect.closeTo(2.3, 12) });
    s = remembered(remembered(remembered(s)));
    expect(s.interval).toBe(14); // round(6 * 2.3)
  });

  it("ease never drops below 1.3", () => {
    let s = initialState();
    for (let i = 0; i < 20; i++) s = forgot(s);
    expect(s.ease).toBeCloseTo(1.3, 12);
  });
});

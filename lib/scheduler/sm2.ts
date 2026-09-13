/**
 * SM-2 as Anki runs it, with binary grades. Mirrors ml/baselines.py.
 *
 * Interval 1 day, then 6, then interval * ease. Ease starts at 2.5, drops
 * 0.2 on a lapse, never below 1.3. A lapse resets the interval to 1 day.
 */

export const INITIAL_EASE = 2.5;
export const MIN_EASE = 1.3;
export const LAPSE_PENALTY = 0.2;
export const FIRST_INTERVAL = 1;
export const SECOND_INTERVAL = 6;

export interface Sm2State {
  reps: number;
  ease: number;
  /** Days. Zero before the first review. */
  interval: number;
}

export const initialState = (): Sm2State => ({ reps: 0, ease: INITIAL_EASE, interval: 0 });

export function remembered(s: Sm2State): Sm2State {
  const reps = s.reps + 1;
  const interval =
    reps === 1
      ? FIRST_INTERVAL
      : reps === 2
        ? SECOND_INTERVAL
        : Math.max(s.interval + 1, Math.round(s.interval * s.ease));
  return { reps, ease: s.ease, interval };
}

export function forgot(s: Sm2State): Sm2State {
  return {
    reps: 0,
    ease: Math.max(MIN_EASE, s.ease - LAPSE_PENALTY),
    interval: FIRST_INTERVAL,
  };
}

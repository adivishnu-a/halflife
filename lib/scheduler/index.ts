/**
 * What happens to a card's state after a grade, for both schedulers.
 *
 * Classic is SM-2 with binary grades. Halflife asks the model for the card's
 * new half-life and schedules the review for when recall is predicted to fall
 * to the target retention. Both floor the gap at one day: this is a daily tool.
 * The model's half-life is stored whichever scheduler set the date, so the
 * Why-this-date panel and the stats can always compare the two.
 */

import { nextIntervalDays } from "./hlr";
import { forgot, initialState as sm2Initial, remembered as sm2Remembered, type Sm2State } from "./sm2";

export type SchedulerName = "classic" | "halflife";

export interface CardState {
  seen: number;
  correct: number;
  wrong: number;
  firstSeenAt: Date | null;
  lastReviewedAt: Date | null;
  lastResponseMs: number | null;
  dueAt: Date | null;
  halfLifeDays: number | null;
  scheduler: SchedulerName | null;
  modelVersion: number | null;
  sm2Reps: number;
  sm2Ease: number;
  sm2IntervalDays: number;
}

export const FRESH_STATE: CardState = {
  seen: 0,
  correct: 0,
  wrong: 0,
  firstSeenAt: null,
  lastReviewedAt: null,
  lastResponseMs: null,
  dueAt: null,
  halfLifeDays: null,
  scheduler: null,
  modelVersion: null,
  sm2Reps: 0,
  sm2Ease: 2.5,
  sm2IntervalDays: 0,
};

export const MIN_GAP_DAYS = 1;
const DAY_MS = 86_400_000;

export interface Grade {
  remembered: boolean;
  reviewedAt: Date;
  responseMs: number | null;
}

export interface Outcome {
  state: CardState;
  intervalDays: number;
}

/** The counts the model is asked about after this grade is applied. */
export function countsAfter(state: CardState, remembered: boolean): { seen: number; correct: number } {
  return { seen: state.seen + 1, correct: state.correct + (remembered ? 1 : 0) };
}

export function applyReview(
  state: CardState,
  grade: Grade,
  scheduler: SchedulerName,
  targetRetention: number,
  model: { halfLifeAfter: number; version: number },
): Outcome {
  const sm2: Sm2State = { reps: state.sm2Reps, ease: state.sm2Ease, interval: state.sm2IntervalDays };
  const nextSm2 = grade.remembered ? sm2Remembered(sm2) : forgot(sm2);
  const modelGap = nextIntervalDays(model.halfLifeAfter, targetRetention);
  const intervalDays = Math.max(MIN_GAP_DAYS, scheduler === "classic" ? nextSm2.interval : modelGap);
  return {
    intervalDays,
    state: {
      seen: state.seen + 1,
      correct: state.correct + (grade.remembered ? 1 : 0),
      wrong: state.wrong + (grade.remembered ? 0 : 1),
      firstSeenAt: state.firstSeenAt ?? grade.reviewedAt,
      lastReviewedAt: grade.reviewedAt,
      lastResponseMs: grade.responseMs,
      dueAt: new Date(grade.reviewedAt.getTime() + intervalDays * DAY_MS),
      halfLifeDays: model.halfLifeAfter,
      scheduler,
      modelVersion: model.version,
      sm2Reps: nextSm2.reps,
      sm2Ease: nextSm2.ease,
      sm2IntervalDays: nextSm2.interval,
    },
  };
}

export { sm2Initial };

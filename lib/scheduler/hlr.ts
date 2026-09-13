/**
 * Half-life regression in TypeScript. The fallback when the Python function
 * is slow or down, and the half of the parity test that must agree with
 * ml/features.py to six decimal places.
 *
 *   h = 2 ** (theta . x)          predicted half-life in days
 *   p = 2 ** (-delta / h)         predicted recall after delta days
 *   next gap = h * log2(1 / r)    when recall is predicted to hit target r
 */

// Bounds from the reference implementation: 15 minutes to 9 months.
export const MIN_HALF_LIFE = 15 / (24 * 60);
export const MAX_HALF_LIFE = 274;
const P_EPS = 1e-4;

export type FeatureName =
  | "bias"
  | "sqrt_seen"
  | "sqrt_correct"
  | "sqrt_wrong"
  | "log_days_since_first"
  | "log_response_s";

export interface Weights {
  version: number;
  features: FeatureName[];
  theta: number[];
}

export interface CardHistory {
  seen: number;
  correct: number;
  /** Days since the card was first seen. Omit when unknown; the feature is then inert. */
  daysSinceFirst?: number;
  /** Response time of the last review in milliseconds. Omit when unknown. */
  responseMs?: number;
}

export function featurize(card: CardHistory, names: readonly FeatureName[]): number[] {
  const wrong = card.seen - card.correct;
  if (wrong < 0) throw new RangeError("correct cannot exceed seen");
  const columns: Record<FeatureName, number> = {
    bias: 1,
    sqrt_seen: Math.sqrt(1 + card.seen),
    sqrt_correct: Math.sqrt(1 + card.correct),
    sqrt_wrong: Math.sqrt(1 + wrong),
    log_days_since_first: card.daysSinceFirst === undefined ? 0 : Math.log1p(card.daysSinceFirst),
    log_response_s: card.responseMs === undefined ? 0 : Math.log1p(card.responseMs / 1000),
  };
  return names.map((name) => columns[name]);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

export function halfLife(features: number[], theta: number[]): number {
  let z = 0;
  for (let i = 0; i < theta.length; i++) z += theta[i]! * features[i]!;
  return clamp(Math.pow(2, clamp(z, -60, 60)), MIN_HALF_LIFE, MAX_HALF_LIFE);
}

export function recall(halfLifeDays: number, deltaDays: number): number {
  return clamp(Math.pow(2, -deltaDays / halfLifeDays), P_EPS, 1 - P_EPS);
}

export function nextIntervalDays(halfLifeDays: number, targetRetention: number): number {
  return halfLifeDays * Math.log2(1 / targetRetention);
}

export interface Prediction {
  features: number[];
  halfLifeDays: number;
  p: number;
  nextIntervalDays: number;
}

export function predict(
  weights: Weights,
  card: CardHistory,
  deltaDays: number,
  targetRetention: number,
): Prediction {
  const features = featurize(card, weights.features);
  const h = halfLife(features, weights.theta);
  return {
    features,
    halfLifeDays: h,
    p: recall(h, deltaDays),
    nextIntervalDays: nextIntervalDays(h, targetRetention),
  };
}

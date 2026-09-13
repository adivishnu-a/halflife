/**
 * Ask the model for half-lives. The Python function first; the TypeScript
 * port if it fails or takes longer than the budget. Both compute the same
 * numbers from the same weights, and the parity test keeps it that way.
 */

import { predict as predictTs, type CardHistory } from "./hlr";
import { WEIGHTS } from "./weights";

export const PYTHON_TIMEOUT_MS = 1500;

export interface PredictInput extends CardHistory {
  id: string;
  deltaDays: number;
}

export interface PredictOutput {
  id: string;
  p: number;
  halfLifeDays: number;
}

export interface PredictResult {
  source: "python" | "typescript";
  modelVersion: number;
  items: PredictOutput[];
}

function pythonOrigin(): string {
  if (process.env.PY_API_ORIGIN) return process.env.PY_API_ORIGIN;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:8000";
}

async function predictPython(inputs: PredictInput[]): Promise<PredictResult> {
  const res = await fetch(`${pythonOrigin()}/api/py/predict`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      items: inputs.map((i) => ({
        card_id: i.id,
        features: {
          seen: i.seen,
          correct: i.correct,
          delta_days: i.deltaDays,
          days_since_first: i.daysSinceFirst ?? 0,
          response_ms: i.responseMs ?? 0,
          card_key: i.cardKey ?? null,
        },
      })),
    }),
    signal: AbortSignal.timeout(PYTHON_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`python function answered ${res.status}`);
  const body = (await res.json()) as {
    model_version: number;
    items: { card_id: string; p: number; half_life_days: number }[];
  };
  if (body.model_version !== WEIGHTS.version) {
    throw new Error(`python serves model v${body.model_version}, app expects v${WEIGHTS.version}`);
  }
  return {
    source: "python",
    modelVersion: body.model_version,
    items: body.items.map((i) => ({ id: i.card_id, p: i.p, halfLifeDays: i.half_life_days })),
  };
}

function predictTypescript(inputs: PredictInput[]): PredictResult {
  return {
    source: "typescript",
    modelVersion: WEIGHTS.version,
    items: inputs.map((i) => {
      const out = predictTs(WEIGHTS, i, i.deltaDays, 0.9);
      return { id: i.id, p: out.p, halfLifeDays: out.halfLifeDays };
    }),
  };
}

export async function predictBatch(inputs: PredictInput[]): Promise<PredictResult> {
  if (inputs.length === 0) return { source: "typescript", modelVersion: WEIGHTS.version, items: [] };
  const started = Date.now();
  try {
    const result = await predictPython(inputs);
    console.info(`[predict] source=python items=${inputs.length} ms=${Date.now() - started}`);
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[predict] source=typescript items=${inputs.length} ms=${Date.now() - started} python_failed="${reason}"`);
    return predictTypescript(inputs);
  }
}

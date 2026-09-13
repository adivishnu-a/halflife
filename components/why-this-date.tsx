import { formatDays, formatDue, formatPercent } from "@/lib/format";
import { featurize, halfLife, nextIntervalDays, recall } from "@/lib/scheduler/hlr";
import { WEIGHTS } from "@/lib/scheduler/weights";

export interface WhyState {
  seen: number;
  correct: number;
  wrong: number;
  firstSeenAt: Date | null;
  lastReviewedAt: Date | null;
  lastResponseMs: number | null;
  dueAt: Date | null;
  halfLifeDays: number | null;
  scheduler: "classic" | "halflife" | null;
}

const FEATURE_LABELS: Record<string, string> = {
  bias: "bias",
  sqrt_seen: "√(1 + seen)",
  sqrt_correct: "√(1 + remembered)",
  sqrt_wrong: "√(1 + forgot)",
  log_days_since_first: "log(1 + days since first seen)",
  log_response_s: "log(1 + last response, s)",
};

const DAY_MS = 86_400_000;

/**
 * The ML made visible: the features the model sees for this card, the
 * half-life it predicts, recall today, and the target that set the date.
 */
export function WhyThisDate({
  state,
  targetRetention,
  now = new Date(),
}: {
  state: WhyState;
  targetRetention: number;
  now?: Date;
}) {
  const daysSinceFirst = state.firstSeenAt ? (now.getTime() - state.firstSeenAt.getTime()) / DAY_MS : undefined;
  const features = featurize(
    {
      seen: state.seen,
      correct: state.correct,
      daysSinceFirst,
      responseMs: state.lastResponseMs ?? undefined,
    },
    WEIGHTS.features,
  );
  const h = halfLife(features, WEIGHTS.theta);
  const sinceLast = state.lastReviewedAt ? (now.getTime() - state.lastReviewedAt.getTime()) / DAY_MS : 0;
  const pToday = recall(h, Math.max(0, sinceLast));
  const modelGap = Math.max(1, nextIntervalDays(h, targetRetention));
  const classic = state.scheduler === "classic";

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="muted">Predicted half-life</dt>
        <dd className="font-medium">{formatDays(h)}</dd>
        <dt className="muted">Recall today</dt>
        <dd>
          <RecallMeter p={pToday} target={targetRetention} />
        </dd>
        <dt className="muted">Target retention</dt>
        <dd>{formatPercent(targetRetention)}</dd>
        <dt className="muted">{classic ? "Model's next gap" : "Next gap"}</dt>
        <dd>
          {formatDays(modelGap)}
          <span className="faint"> · when recall is predicted to fall to {formatPercent(targetRetention)}</span>
        </dd>
        {state.dueAt && (
          <>
            <dt className="muted">Due</dt>
            <dd>
              {formatDue(state.dueAt, now)}
              <span className="faint"> · set by {classic ? "Classic (SM-2)" : "Halflife (model)"}</span>
            </dd>
          </>
        )}
      </div>
      <div>
        <p className="muted">What the model saw</p>
        <table className="mt-1 w-full max-w-sm text-left">
          <thead className="sr-only">
            <tr>
              <th>Feature</th>
              <th>Value</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {WEIGHTS.features.map((name, i) => (
              <tr key={name} className="border-t border-line">
                <td className="py-1 pr-3">{FEATURE_LABELS[name] ?? name}</td>
                <td className="py-1 pr-3 tabular-nums">{features[i]!.toFixed(3)}</td>
                <td className="py-1 tabular-nums faint">× {WEIGHTS.theta[i]!.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 faint">
          Half-life = 2<sup>Σ value × weight</sup>. Model v{WEIGHTS.version}, trained on 12.85 million Duolingo review traces.
        </p>
      </div>
    </div>
  );
}

export function RecallMeter({ p, target }: { p: number; target: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-medium tabular-nums">{formatPercent(p)}</span>
      <span
        role="img"
        aria-label={`Recall ${formatPercent(p)}, target ${formatPercent(target)}`}
        className="relative inline-block h-2 w-28 overflow-hidden rounded-full bg-paper-2"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${p * 100}%`, background: p >= target ? "var(--color-remembered)" : "var(--color-forgot)" }}
        />
        <span className="absolute inset-y-0 w-px bg-ink" style={{ left: `${target * 100}%` }} />
      </span>
    </span>
  );
}

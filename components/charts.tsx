import type { CalibrationBin, DayCount } from "@/lib/stats";

/**
 * Two authored SVG charts, server-rendered. Marks carry the data colour; text
 * uses the ink tokens. Each mark has a title for hover, and a table view sits
 * under each chart for the numbers.
 */

export function ReviewsPerDay({ days }: { days: DayCount[] }) {
  const width = 720;
  const height = 180;
  const pad = { top: 12, right: 8, bottom: 24, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...days.map((d) => d.reviews));
  const tick = niceTick(max);
  const yMax = Math.ceil(max / tick) * tick;
  const slot = plotW / days.length;
  const barW = Math.min(24, Math.max(2, slot - 2));
  const y = (v: number) => pad.top + plotH - (v / yMax) * plotH;
  const monthStarts = days.map((d, i) => ({ d, i })).filter(({ d }) => d.day.endsWith("-01"));
  const label = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Reviews per day for the last 90 days" className="w-full">
        {Array.from({ length: yMax / tick + 1 }, (_, k) => k * tick).map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={pad.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-ink-3)">
              {v}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.left + i * slot + (slot - barW) / 2;
          const h = (d.reviews / yMax) * plotH;
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${d.reviews} ${d.reviews === 1 ? "review" : "reviews"}`}</title>
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} fill="transparent" />
              {d.reviews > 0 && (
                <path
                  d={roundedTopBar(x, y(d.reviews), barW, h, Math.min(4, barW / 2))}
                  fill="var(--color-ink-2)"
                />
              )}
            </g>
          );
        })}
        {monthStarts.map(({ d, i }) => (
          <text key={d.day} x={pad.left + i * slot} y={height - 6} fontSize={11} fill="var(--color-ink-3)">
            {label(d.day)}
          </text>
        ))}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 muted">Table of days with reviews</summary>
        <table className="w-full max-w-xs text-left">
          <thead>
            <tr className="muted"><th className="py-1 font-medium">Day</th><th className="py-1 text-right font-medium">Reviews</th></tr>
          </thead>
          <tbody>
            {days.filter((d) => d.reviews > 0).map((d) => (
              <tr key={d.day} className="border-t border-line"><td className="py-1">{d.day}</td><td className="py-1 text-right tabular-nums">{d.reviews}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export function Calibration({ bins }: { bins: CalibrationBin[] }) {
  const size = 320;
  const pad = { top: 12, right: 12, bottom: 32, left: 40 };
  const plot = size - pad.left - pad.right;
  const plotH = size - pad.top - pad.bottom;
  const x = (v: number) => pad.left + v * plot;
  const y = (v: number) => pad.top + plotH - v * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <figure>
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Predicted recall against observed recall in ten bins" className="w-full max-w-sm">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={size - pad.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <line y1={pad.top} y2={size - pad.bottom} x1={x(t)} x2={x(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-ink-3)">{Math.round(t * 100)}%</text>
            <text x={x(t)} y={size - pad.bottom + 14} textAnchor="middle" fontSize={11} fill="var(--color-ink-3)">{Math.round(t * 100)}%</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--color-ink-3)" strokeWidth={1} />
        {bins.map((b) => (
          <g key={b.bin}>
            <title>{`Predicted ${Math.round(b.predicted * 100)}%, remembered ${Math.round(b.observed * 100)}% of ${b.n}`}</title>
            <circle cx={x(b.predicted)} cy={y(b.observed)} r={Math.max(4, Math.min(9, Math.sqrt(b.n)))} fill="var(--color-ink-2)" stroke="var(--color-paper)" strokeWidth={2} />
          </g>
        ))}
        <text x={size / 2} y={size - 4} textAnchor="middle" fontSize={11} fill="var(--color-ink-2)">predicted recall</text>
        <text transform={`translate(10 ${size / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="var(--color-ink-2)">observed recall</text>
      </svg>
      <details className="mt-2 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 muted">Table of bins</summary>
        <table className="w-full max-w-sm text-left">
          <thead>
            <tr className="muted"><th className="py-1 font-medium">Predicted</th><th className="py-1 text-right font-medium">Observed</th><th className="py-1 text-right font-medium">Reviews</th></tr>
          </thead>
          <tbody>
            {bins.map((b) => (
              <tr key={b.bin} className="border-t border-line">
                <td className="py-1">{b.bin}</td>
                <td className="py-1 text-right tabular-nums">{Math.round(b.observed * 100)}%</td>
                <td className="py-1 text-right tabular-nums">{b.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function niceTick(max: number): number {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const candidates = [1, 2, 5, 10].map((m) => m * pow);
  return candidates.find((c) => c >= raw) ?? candidates[candidates.length - 1]!;
}

function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

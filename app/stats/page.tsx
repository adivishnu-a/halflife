import type { Metadata } from "next";
import Link from "next/link";

import { Calibration, ReviewsPerDay } from "@/components/charts";
import { listDecks } from "@/lib/decks";
import { formatDays, formatNumber, formatPercent } from "@/lib/format";
import { requireUserId } from "@/lib/session";
import { CALIBRATION_MIN_REVIEWS, getStats } from "@/lib/stats";

export const metadata: Metadata = { title: "Stats" };
export const dynamic = "force-dynamic";

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ deck?: string }> }) {
  const userId = await requireUserId();
  const { deck: deckParam } = await searchParams;
  const decks = await listDecks(userId);
  const deckId = decks.some((d) => d.id === deckParam) ? deckParam! : null;
  const stats = await getStats(userId, deckId);
  const deckName = deckId ? decks.find((d) => d.id === deckId)!.name : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold">Stats{deckName ? `: ${deckName}` : ""}</h1>
        {decks.length > 1 && (
          <nav aria-label="Deck" className="flex flex-wrap gap-1 text-sm">
            <Link href="/stats" aria-current={!deckId ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-md px-3 ${!deckId ? "bg-paper-2 font-medium" : "muted hover:bg-paper-2"}`}>
              All decks
            </Link>
            {decks.map((d) => (
              <Link key={d.id} href={`/stats?deck=${d.id}`} aria-current={deckId === d.id ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-md px-3 ${deckId === d.id ? "bg-paper-2 font-medium" : "muted hover:bg-paper-2"}`}>
                {d.name}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {stats.totalReviews === 0 ? (
        <p className="stock p-6 muted">No reviews yet. Numbers appear here after your first session.</p>
      ) : (
        <>
          <dl className="grid gap-6 border-y border-line py-5 sm:grid-cols-3">
            <div>
              <dt className="text-sm muted">Retention on due reviews</dt>
              <dd className="mt-1 text-3xl font-bold">{stats.retention === null ? "–" : formatPercent(stats.retention)}</dd>
              <dd className="text-sm faint">{formatNumber(stats.dueReviews)} reviews of cards seen before</dd>
            </div>
            <div>
              <dt className="text-sm muted">Reviews in 90 days</dt>
              <dd className="mt-1 text-3xl font-bold">{formatNumber(stats.perDay.reduce((a, d) => a + d.reviews, 0))}</dd>
              <dd className="text-sm faint">{formatNumber(stats.totalReviews)} all time</dd>
            </div>
            <div>
              <dt className="text-sm muted">Reviews per active day</dt>
              <dd className="mt-1 text-3xl font-bold">
                {(() => {
                  const active = stats.perDay.filter((d) => d.reviews > 0);
                  return active.length ? formatNumber(Math.round(active.reduce((a, d) => a + d.reviews, 0) / active.length)) : "–";
                })()}
              </dd>
              <dd className="text-sm faint">{stats.perDay.filter((d) => d.reviews > 0).length} active days of 90</dd>
            </div>
          </dl>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Reviews per day</h2>
            <ReviewsPerDay days={stats.perDay} />
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold">Classic against Halflife</h2>
            <p className="mb-3 text-sm muted">Reviews of cards seen before, grouped by the scheduler that set their date.</p>
            <table className="w-full max-w-md text-left text-sm">
              <thead>
                <tr className="muted"><th className="py-1 font-medium">Scheduler</th><th className="py-1 text-right font-medium">Reviews</th><th className="py-1 text-right font-medium">Retention</th><th className="py-1 text-right font-medium">Mean gap</th></tr>
              </thead>
              <tbody>
                {stats.bySchedulerCount.map((s) => (
                  <tr key={s.scheduler} className="border-t border-line">
                    <td className="py-1.5">{s.scheduler === "classic" ? "Classic (SM-2)" : "Halflife (model)"}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatNumber(s.reviews)}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.retention === null ? "–" : formatPercent(s.retention)}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.meanGapDays === null ? "–" : formatDays(s.meanGapDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold">Is the model calibrated on you?</h2>
            {stats.calibration ? (
              <>
                <p className="mb-3 max-w-prose text-sm muted">
                  Each dot is a tenth of the predicted-recall range. On the line, the model is right about how often you
                  remember. Above it, you remember more than it thinks; below, less. {formatNumber(stats.predictedReviews)} reviews.
                </p>
                <Calibration bins={stats.calibration} />
              </>
            ) : (
              <p className="max-w-prose text-sm muted">
                Appears after {CALIBRATION_MIN_REVIEWS} reviews of cards seen before, so the bins have enough in them to mean
                something. You have {formatNumber(stats.predictedReviews)}.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

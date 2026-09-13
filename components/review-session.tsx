"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RecallMeter } from "@/components/why-this-date";
import { dueTomorrow, gradeCard, type GradeInput, type GradeResult } from "@/lib/actions/review";
import { formatDays, formatDue, formatPercent } from "@/lib/format";
import type { QueueCard } from "@/lib/queue";
import { featurize, halfLife, nextIntervalDays } from "@/lib/scheduler/hlr";
import { WEIGHTS } from "@/lib/scheduler/weights";

interface Props {
  deckId: string;
  deckName: string;
  cards: QueueCard[];
  scheduler: "classic" | "halflife";
  targetRetention: number;
  predictionSource: "python" | "typescript" | null;
}

interface QueueItem extends QueueCard {
  relearn: boolean;
}

interface Pending {
  input: GradeInput;
  front: string;
}

const GRADE_LOCK_MS = 350;

export function ReviewSession({ deckId, deckName, cards, scheduler, targetRetention }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>(() => cards.map((c) => ({ ...c, relearn: false })));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [locked, setLocked] = useState(false);
  const [results, setResults] = useState<Record<string, GradeResult>>({});
  const [lastGrade, setLastGrade] = useState<{ key: string; remembered: boolean; front: string } | null>(null);
  const [failed, setFailed] = useState<Pending[]>([]);
  const [tally, setTally] = useState({ reviewed: 0, remembered: 0 });
  const [tomorrow, setTomorrow] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const current = queue[index];
  const finished = index >= queue.length;
  const total = queue.length;

  const submit = useCallback(async (pending: Pending) => {
    const key = `${pending.input.cardId}:${pending.input.reviewedAt}`;
    try {
      const res = await gradeCard(pending.input);
      if (!res.ok) throw new Error(res.message);
      setResults((r) => ({ ...r, [key]: res }));
    } catch {
      setFailed((f) => (f.some((p) => p.input.reviewedAt === pending.input.reviewedAt) ? f : [...f, pending]));
    }
  }, []);

  const grade = useCallback(
    (remembered: boolean) => {
      if (!current || !revealed || locked) return;
      const now = Date.now();
      const input: GradeInput = { cardId: current.id, reviewedAt: now, remembered, responseMs: now - shownAt };
      setLocked(true);
      setLastGrade({ key: `${current.id}:${now}`, remembered, front: current.front });
      setTally((t) => ({ reviewed: t.reviewed + 1, remembered: t.remembered + (remembered ? 1 : 0) }));
      if (!remembered && !current.relearn) {
        setQueue((q) => [...q, { ...current, relearn: true, seen: current.seen + 1, p: null, halfLifeDays: null }]);
      }
      void submit({ input, front: current.front });
      setIndex((i) => i + 1);
      setRevealed(false);
      setShownAt(now);
      window.setTimeout(() => setLocked(false), GRADE_LOCK_MS);
    },
    [current, revealed, locked, shownAt, submit],
  );

  const reveal = useCallback(() => {
    if (!current || revealed) return;
    setRevealed(true);
  }, [current, revealed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === " " || e.key === "Enter") {
        if (!revealed && current) {
          e.preventDefault();
          reveal();
        }
      } else if (e.key === "1") {
        e.preventDefault();
        grade(false);
      } else if (e.key === "2") {
        e.preventDefault();
        grade(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, revealed, reveal, grade]);

  useEffect(() => {
    if (finished && tomorrow === null) {
      dueTomorrow(deckId).then(setTomorrow).catch(() => setTomorrow(-1));
    }
  }, [finished, tomorrow, deckId]);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [index]);

  const retryFailed = () => {
    const batch = failed;
    setFailed([]);
    batch.forEach((p) => void submit(p));
  };

  const lastResult = lastGrade ? results[lastGrade.key] : undefined;

  const modelView = useMemo(() => {
    if (!current || current.fresh) return null;
    const features = featurize({ seen: current.seen, correct: current.correct }, WEIGHTS.features);
    const h = current.halfLifeDays ?? halfLife(features, WEIGHTS.theta);
    return { h, p: current.p, gapIfRemembered: Math.max(1, nextIntervalDays(h, targetRetention)) };
  }, [current, targetRetention]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm muted">
        <Link href={`/decks/${deckId}`} className="hover:underline">
          {deckName}
        </Link>
        <span aria-live="polite" className="tabular-nums">
          {finished ? "Done" : `${index + 1} of ${total}`}
          {tally.reviewed > 0 && ` · ${tally.reviewed - tally.remembered} forgot`}
        </span>
      </div>

      {failed.length > 0 && (
        <div role="alert" className="card flex flex-wrap items-center justify-between gap-3 border-forgot p-4 text-sm">
          <span>
            {failed.length === 1 ? "One review did not save" : `${failed.length} reviews did not save`}: {failed.map((f) => f.front).join(", ")}.
            Your grades are kept here until they do.
          </span>
          <button type="button" className="btn btn-secondary" onClick={retryFailed}>
            Retry saving
          </button>
        </div>
      )}

      <p aria-live="polite" className="min-h-6 text-sm muted">
        {lastGrade && (
          <>
            <span className={lastGrade.remembered ? "text-remembered" : "text-forgot"}>
              {lastGrade.remembered ? "Remembered" : "Forgot"}
            </span>{" "}
            {lastGrade.front}
            {lastResult ? (
              <>
                {" · back "}
                {formatDue(new Date(lastResult.dueAt))}
                <span className="faint"> · {lastResult.scheduler === "classic" ? "Classic" : "Halflife"}</span>
              </>
            ) : (
              <span className="faint"> · saving</span>
            )}
          </>
        )}
      </p>

      {finished ? (
        <section className="card rise p-6 sm:p-8">
          <h1 className="text-2xl font-semibold">Session done</h1>
          <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="text-sm muted">Reviewed</dt>
              <dd className="text-xl font-medium tabular-nums">{tally.reviewed}</dd>
            </div>
            <div>
              <dt className="text-sm muted">Remembered</dt>
              <dd className="text-xl font-medium tabular-nums">
                {tally.reviewed ? formatPercent(tally.remembered / tally.reviewed) : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-sm muted">Due tomorrow</dt>
              <dd className="text-xl font-medium tabular-nums">
                {tomorrow === null ? "…" : tomorrow < 0 ? "?" : tomorrow}
              </dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/decks/${deckId}`} className="btn btn-primary">
              Back to {deckName}
            </Link>
            <Link href="/" className="btn btn-secondary">
              All decks
            </Link>
          </div>
        </section>
      ) : (
        current && (
          <>
            <div
              ref={cardRef}
              tabIndex={-1}
              key={`${current.id}-${index}`}
              className="card rise flex min-h-[40vh] flex-col justify-center px-6 py-10 outline-none sm:px-10"
            >
              {current.fresh && <p className="mb-3 text-sm faint">New card</p>}
              {current.relearn && <p className="mb-3 text-sm faint">Again</p>}
              <p lang="de" className="break-words text-3xl font-medium leading-tight">
                {current.front}
              </p>
              {revealed ? (
                <div className="rise mt-6 border-t border-line pt-6">
                  <p className="break-words text-xl">{current.back}</p>
                  {current.example && <p lang="de" className="mt-3 break-words text-lg muted">{current.example}</p>}
                  {current.note && <p className="mt-2 break-words text-sm muted">{current.note}</p>}
                </div>
              ) : (
                <p className="sr-only">Answer hidden</p>
              )}
            </div>

            {revealed ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => grade(false)}
                  disabled={locked}
                  className="btn min-h-14 border-forgot text-forgot hover:bg-forgot-tint text-base"
                >
                  Forgot <kbd className="rounded border border-current px-1.5 text-xs opacity-70">1</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => grade(true)}
                  disabled={locked}
                  className="btn min-h-14 border-remembered text-remembered hover:bg-remembered-tint text-base"
                >
                  Remembered <kbd className="rounded border border-current px-1.5 text-xs opacity-70">2</kbd>
                </button>
              </div>
            ) : (
              <button type="button" onClick={reveal} className="btn btn-primary min-h-14 w-full text-base">
                Show answer <kbd className="rounded border border-current px-1.5 text-xs opacity-70">space</kbd>
              </button>
            )}

            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer py-2 muted">Why this date</summary>
              <div className="card mt-2 p-4">
                {modelView ? (
                  <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                    <dt className="muted">Recall now</dt>
                    <dd>{modelView.p !== null ? <RecallMeter p={modelView.p} target={targetRetention} /> : "–"}</dd>
                    <dt className="muted">Predicted half-life</dt>
                    <dd>{formatDays(modelView.h)}</dd>
                    <dt className="muted">History</dt>
                    <dd>
                      seen {current.seen}, remembered {current.correct}, forgot {current.seen - current.correct}
                    </dd>
                    <dt className="muted">Scheduler</dt>
                    <dd>{scheduler === "classic" ? "Classic (SM-2)" : "Halflife (model)"} · target {formatPercent(targetRetention)}</dd>
                  </dl>
                ) : (
                  <p className="muted">
                    First time you see this card, so there is nothing to predict yet. After you grade it the model gives it a
                    half-life and the scheduler sets its first date.
                  </p>
                )}
              </div>
            </details>
          </>
        )
      )}
    </div>
  );
}

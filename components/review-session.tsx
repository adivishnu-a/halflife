"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CountUp } from "@/components/count-up";
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

interface Leaving {
  card: QueueItem;
  remembered: boolean;
  key: number;
}

const GRADE_LOCK_MS = 350;

export function ReviewSession({ deckId, deckName, cards, scheduler, targetRetention }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>(() => cards.map((c) => ({ ...c, relearn: false })));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [locked, setLocked] = useState(false);
  const [grades, setGrades] = useState<boolean[]>([]);
  const [results, setResults] = useState<Record<string, GradeResult>>({});
  const [lastGrade, setLastGrade] = useState<{ key: string; remembered: boolean; front: string } | null>(null);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const [failed, setFailed] = useState<Pending[]>([]);
  const [tomorrow, setTomorrow] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const current = queue[index];
  const finished = index >= queue.length;
  const total = queue.length;
  const remembered = grades.filter(Boolean).length;

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
    (wasRemembered: boolean) => {
      if (!current || !revealed || locked) return;
      const now = Date.now();
      const input: GradeInput = { cardId: current.id, reviewedAt: now, remembered: wasRemembered, responseMs: now - shownAt };
      setLocked(true);
      setLeaving({ card: current, remembered: wasRemembered, key: now });
      setLastGrade({ key: `${current.id}:${now}`, remembered: wasRemembered, front: current.front });
      setGrades((g) => [...g, wasRemembered]);
      if (!wasRemembered && !current.relearn) {
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
    <div className="mat -mx-4 px-4 py-5 sm:mx-0 sm:px-8 sm:py-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <Link href={`/decks/${deckId}`} className="on-mat-2 hover:underline">
          {deckName}
        </Link>
        <span aria-live="polite" className="on-mat-2 tabular-nums">
          {finished ? "Done" : `${index + 1} of ${total}`}
        </span>
      </div>

      <div className="segments mt-3" aria-hidden="true">
        {queue.map((c, i) => (
          <i
            key={`${c.id}-${i}`}
            data-grade={grades[i] === undefined ? undefined : grades[i] ? "remembered" : "forgot"}
            data-current={i === index ? "true" : undefined}
          />
        ))}
      </div>

      {failed.length > 0 && (
        <div role="alert" className="mt-4 flex flex-wrap rounded-lg border border-mat-line bg-mat-2 text-on-mat items-center justify-between gap-3 p-4 text-sm">
          <span>
            {failed.length === 1 ? "One review did not save" : `${failed.length} reviews did not save`}: {failed.map((f) => f.front).join(", ")}.
            Your grades are kept here until they do.
          </span>
          <button type="button" className="btn btn-primary" onClick={retryFailed}>
            Retry saving
          </button>
        </div>
      )}

      <p aria-live="polite" className="mt-4 min-h-6 text-sm on-mat-2">
        {lastGrade && (
          <>
            <span className="font-semibold text-on-mat">{lastGrade.remembered ? "Remembered" : "Forgot"}</span> {lastGrade.front}
            {lastResult ? (
              <>
                {" · back "}
                {formatDue(new Date(lastResult.dueAt))}
                {" · "}
                {lastResult.scheduler === "classic" ? "Classic" : "Halflife"}
              </>
            ) : (
              " · saving"
            )}
          </>
        )}
      </p>

      {finished ? (
        <section className="stock rise mt-4 p-6 sm:p-8">
          <h1 className="text-2xl font-bold">Session done</h1>
          <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm muted">Reviewed</dt>
              <dd className="text-3xl font-bold"><CountUp to={grades.length} /></dd>
            </div>
            <div>
              <dt className="text-sm muted">Remembered</dt>
              <dd className="text-3xl font-bold">
                {grades.length ? <CountUp to={Math.round((remembered / grades.length) * 100)} suffix="%" /> : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-sm muted">Due tomorrow</dt>
              <dd className="text-3xl font-bold">{tomorrow === null ? "…" : tomorrow < 0 ? "?" : <CountUp to={tomorrow} />}</dd>
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
            <div className="stack mt-4 mb-9">
              <div className="stack-ghost two" aria-hidden="true" />
              <div className="stack-ghost one" aria-hidden="true" />
              {leaving && (
                <div
                  key={leaving.key}
                  aria-hidden="true"
                  className={`stock ${leaving.remembered ? "throw-right" : "throw-left"} flex min-h-[44vh] flex-col justify-center px-6 py-10 sm:px-10`}
                  onAnimationEnd={() => setLeaving((l) => (l?.key === leaving.key ? null : l))}
                >
                  <span className={`stamp ${leaving.remembered ? "text-remembered" : "text-forgot"}`}>
                    {leaving.remembered ? "Remembered" : "Forgot"}
                  </span>
                  <p lang="de" className="break-words text-3xl font-bold leading-tight sm:text-4xl">{leaving.card.front}</p>
                </div>
              )}
              <div key={`${current.id}-${index}`} className="deal relative">
                <div ref={cardRef} tabIndex={-1} className={`flip outline-none ${revealed ? "flipped" : ""}`}>
                  <div className="face front stock flex min-h-[44vh] flex-col justify-center px-6 py-10 sm:px-10" aria-hidden={revealed}>
                    {current.fresh && <p className="mb-3 text-sm faint">New card</p>}
                    {current.relearn && <p className="mb-3 text-sm faint">Again</p>}
                    <p lang="de" className="break-words text-3xl font-bold leading-tight sm:text-4xl">{current.front}</p>
                    {!revealed && <p className="sr-only">Answer hidden</p>}
                  </div>
                  <div className="face back stock flex min-h-[44vh] flex-col justify-center px-6 py-10 sm:px-10" aria-hidden={!revealed}>
                    <p lang="de" className="text-lg font-semibold muted">{current.front}</p>
                    <p className="mt-2 break-words text-3xl font-bold leading-tight">{current.back}</p>
                    {current.example && <p lang="de" className="mt-4 break-words text-lg muted">{current.example}</p>}
                    {current.note && <p className="mt-2 break-words text-sm muted">{current.note}</p>}
                  </div>
                </div>
              </div>
            </div>

            <div>
              {revealed ? (
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => grade(false)} disabled={locked} className="btn btn-grade btn-forgot">
                    Forgot <kbd className="rounded border border-current px-1.5 text-xs opacity-80">1</kbd>
                  </button>
                  <button type="button" onClick={() => grade(true)} disabled={locked} className="btn btn-grade btn-remembered">
                    Remembered <kbd className="rounded border border-current px-1.5 text-xs opacity-80">2</kbd>
                  </button>
                </div>
              ) : (
                <button type="button" onClick={reveal} className="btn btn-secondary min-h-14 w-full rounded-lg text-lg">
                  Show answer <kbd className="rounded border border-current px-1.5 text-xs opacity-70">space</kbd>
                </button>
              )}
            </div>

            <details className="mt-3 text-sm">
              <summary className="min-h-11 cursor-pointer py-2 on-mat-2">Why this date</summary>
              <div className="mt-2 rounded-lg border border-mat-line bg-mat-2 p-4 text-on-mat">
                {modelView ? (
                  <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                    <dt className="on-mat-2">Recall now</dt>
                    <dd>{modelView.p !== null ? <RecallMeter p={modelView.p} target={targetRetention} /> : "–"}</dd>
                    <dt className="on-mat-2">Predicted half-life</dt>
                    <dd>{formatDays(modelView.h)}</dd>
                    <dt className="on-mat-2">History</dt>
                    <dd>
                      seen {current.seen}, remembered {current.correct}, forgot {current.seen - current.correct}
                    </dd>
                    <dt className="on-mat-2">Scheduler</dt>
                    <dd>{scheduler === "classic" ? "Classic (SM-2)" : "Halflife (model)"} · target {formatPercent(targetRetention)}</dd>
                  </dl>
                ) : (
                  <p className="on-mat-2">
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

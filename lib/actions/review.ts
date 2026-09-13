"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, schema } from "@/lib/db";
import { applyReview, countsAfter, FRESH_STATE, type CardState } from "@/lib/scheduler";
import { predictBatch } from "@/lib/scheduler/model";
import { requireUserId } from "@/lib/session";
import { getSettings } from "@/lib/settings";

const DAY_MS = 86_400_000;

export interface GradeInput {
  cardId: string;
  /** Client clock at the moment of grading, epoch ms. Part of the idempotency key. */
  reviewedAt: number;
  remembered: boolean;
  responseMs: number | null;
}

export interface GradeResult {
  ok: true;
  cardId: string;
  scheduler: "classic" | "halflife";
  intervalDays: number;
  dueAt: string;
  halfLifeDays: number;
  /** Recall the model predicted for this review before the answer, null on a first exposure. */
  pPredicted: number | null;
  duplicate: boolean;
}

export interface GradeError {
  ok: false;
  message: string;
}

export async function gradeCard(input: GradeInput): Promise<GradeResult | GradeError> {
  const userId = await requireUserId();
  const now = new Date();
  // Trust the client's timestamp for the key, but keep it inside a sane window.
  const reviewedAt = new Date(Math.min(Math.max(input.reviewedAt, now.getTime() - DAY_MS), now.getTime() + 60_000));
  const responseMs =
    typeof input.responseMs === "number" && Number.isFinite(input.responseMs)
      ? Math.max(0, Math.min(Math.round(input.responseMs), 10 * 60_000))
      : null;

  const [card] = await db
    .select({ id: schema.cards.id, deckId: schema.cards.deckId, sourceKey: schema.cards.sourceKey })
    .from(schema.cards)
    .innerJoin(schema.decks, eq(schema.decks.id, schema.cards.deckId))
    .where(and(eq(schema.cards.id, input.cardId), eq(schema.decks.userId, userId)))
    .limit(1);
  if (!card) return { ok: false, message: "That card is not yours." };

  const settings = await getSettings(userId);
  const [existing] = await db
    .select()
    .from(schema.cardState)
    .where(and(eq(schema.cardState.userId, userId), eq(schema.cardState.cardId, card.id)))
    .limit(1);
  const before: CardState = existing ?? FRESH_STATE;

  // One model call answers both questions: recall now, and half-life after the grade.
  const after = countsAfter(before, input.remembered);
  const daysSinceFirst = before.firstSeenAt ? (reviewedAt.getTime() - before.firstSeenAt.getTime()) / DAY_MS : undefined;
  const prediction = await predictBatch([
    {
      id: "before",
      seen: before.seen,
      correct: before.correct,
      cardKey: card.sourceKey,
      daysSinceFirst,
      responseMs: before.lastResponseMs ?? undefined,
      deltaDays: before.lastReviewedAt ? Math.max(0, (reviewedAt.getTime() - before.lastReviewedAt.getTime()) / DAY_MS) : 0,
    },
    {
      id: "after",
      seen: after.seen,
      correct: after.correct,
      cardKey: card.sourceKey,
      daysSinceFirst: daysSinceFirst ?? 0,
      responseMs: responseMs ?? undefined,
      deltaDays: 0,
    },
  ]);
  const pBefore = prediction.items.find((i) => i.id === "before")!;
  const hAfter = prediction.items.find((i) => i.id === "after")!.halfLifeDays;

  const outcome = applyReview(
    before,
    { remembered: input.remembered, reviewedAt, responseMs },
    settings.scheduler,
    settings.targetRetention,
    { halfLifeAfter: hAfter, version: prediction.modelVersion },
  );

  const duplicate = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.reviews)
      .values({
        userId,
        cardId: card.id,
        reviewedAt,
        deltaSeconds: before.lastReviewedAt ? Math.round((reviewedAt.getTime() - before.lastReviewedAt.getTime()) / 1000) : null,
        remembered: input.remembered,
        responseMs,
        scheduler: before.scheduler,
        pPredicted: before.seen > 0 ? pBefore.p : null,
        hPredicted: before.seen > 0 ? pBefore.halfLifeDays : null,
        modelVersion: prediction.modelVersion,
        seenBefore: before.seen,
        correctBefore: before.correct,
      })
      .onConflictDoNothing()
      .returning({ id: schema.reviews.id });
    if (inserted.length === 0) return true;
    const { state } = outcome;
    await tx
      .insert(schema.cardState)
      .values({ userId, cardId: card.id, ...state })
      .onConflictDoUpdate({ target: [schema.cardState.userId, schema.cardState.cardId], set: state });
    return false;
  });

  revalidatePath(`/decks/${card.deckId}`);
  revalidatePath("/");
  return {
    ok: true,
    cardId: card.id,
    scheduler: settings.scheduler,
    intervalDays: outcome.intervalDays,
    dueAt: outcome.state.dueAt!.toISOString(),
    halfLifeDays: hAfter,
    pPredicted: before.seen > 0 ? pBefore.p : null,
    duplicate,
  };
}

/** Cards in the deck due by the end of tomorrow, for the end-of-session line. */
export async function dueTomorrow(deckId: string): Promise<number> {
  const userId = await requireUserId();
  const now = new Date();
  const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  const { countDueBefore } = await import("@/lib/decks");
  return countDueBefore(userId, deckId, endOfTomorrow);
}

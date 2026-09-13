/**
 * Today's queue for a deck: due cards first, lowest predicted recall first,
 * then up to the day's allowance of never-seen cards in deck order.
 */

import { and, asc, count, eq, gte, isNull, lte } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { predictBatch } from "@/lib/scheduler/model";
import type { Settings } from "@/lib/settings";

const DAY_MS = 86_400_000;

export interface QueueCard {
  id: string;
  front: string;
  back: string;
  example: string | null;
  note: string | null;
  /** Never reviewed before. */
  fresh: boolean;
  seen: number;
  correct: number;
  /** The model's opinion at queue time; null for fresh cards. */
  p: number | null;
  halfLifeDays: number | null;
}

export interface Queue {
  cards: QueueCard[];
  due: number;
  fresh: number;
  predictionSource: "python" | "typescript" | null;
  modelVersion: number;
}

export async function buildQueue(userId: string, deckId: string, settings: Settings, now = new Date()): Promise<Queue> {
  const dueRows = await db
    .select({
      id: schema.cards.id,
      front: schema.cards.front,
      back: schema.cards.back,
      example: schema.cards.example,
      note: schema.cards.note,
      seen: schema.cardState.seen,
      correct: schema.cardState.correct,
      firstSeenAt: schema.cardState.firstSeenAt,
      lastReviewedAt: schema.cardState.lastReviewedAt,
      lastResponseMs: schema.cardState.lastResponseMs,
    })
    .from(schema.cardState)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.cardState.cardId))
    .where(and(eq(schema.cardState.userId, userId), eq(schema.cards.deckId, deckId), lte(schema.cardState.dueAt, now)));

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [introduced] = await db
    .select({ n: count() })
    .from(schema.reviews)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.reviews.cardId))
    .where(
      and(
        eq(schema.reviews.userId, userId),
        eq(schema.cards.deckId, deckId),
        eq(schema.reviews.seenBefore, 0),
        gte(schema.reviews.reviewedAt, startOfDay),
      ),
    );
  const allowance = Math.max(0, settings.newPerDay - (introduced?.n ?? 0));

  const freshRows = allowance
    ? await db
        .select({
          id: schema.cards.id,
          front: schema.cards.front,
          back: schema.cards.back,
          example: schema.cards.example,
          note: schema.cards.note,
        })
        .from(schema.cards)
        .leftJoin(
          schema.cardState,
          and(eq(schema.cardState.cardId, schema.cards.id), eq(schema.cardState.userId, userId)),
        )
        .where(and(eq(schema.cards.deckId, deckId), isNull(schema.cardState.cardId)))
        .orderBy(asc(schema.cards.position), asc(schema.cards.createdAt))
        .limit(allowance)
    : [];

  const prediction = await predictBatch(
    dueRows.map((r) => ({
      id: r.id,
      seen: r.seen,
      correct: r.correct,
      daysSinceFirst: r.firstSeenAt ? (now.getTime() - r.firstSeenAt.getTime()) / DAY_MS : undefined,
      responseMs: r.lastResponseMs ?? undefined,
      deltaDays: r.lastReviewedAt ? Math.max(0, (now.getTime() - r.lastReviewedAt.getTime()) / DAY_MS) : 0,
    })),
  );
  const byId = new Map(prediction.items.map((i) => [i.id, i]));

  const due: QueueCard[] = dueRows
    .map((r) => {
      const pr = byId.get(r.id);
      return {
        id: r.id,
        front: r.front,
        back: r.back,
        example: r.example,
        note: r.note,
        fresh: false,
        seen: r.seen,
        correct: r.correct,
        p: pr?.p ?? null,
        halfLifeDays: pr?.halfLifeDays ?? null,
      };
    })
    .sort((a, b) => (a.p ?? 1) - (b.p ?? 1));

  const fresh: QueueCard[] = freshRows.map((r) => ({
    ...r,
    fresh: true,
    seen: 0,
    correct: 0,
    p: null,
    halfLifeDays: null,
  }));

  return {
    cards: [...due, ...fresh],
    due: due.length,
    fresh: fresh.length,
    predictionSource: dueRows.length ? prediction.source : null,
    modelVersion: prediction.modelVersion,
  };
}

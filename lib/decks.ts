import { and, asc, count, eq, isNull, lte, sql } from "drizzle-orm";

import starter from "@/content/decks/german-a1.json";
import { db, schema } from "@/lib/db";

export interface DeckSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  cards: number;
  due: number;
  fresh: number;
}

/** Whether the user already holds a copy of the starter deck. */
export async function hasStarterDeck(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.decks.id })
    .from(schema.decks)
    .innerJoin(schema.cards, eq(schema.cards.deckId, schema.decks.id))
    .where(and(eq(schema.decks.userId, userId), eq(schema.cards.sourceKey, starter.cards[0]!.key)))
    .limit(1);
  return !!row;
}

/** Every deck of the user with card, due and never-seen counts. */
export async function listDecks(userId: string, now = new Date()): Promise<DeckSummary[]> {
  const rows = await db
    .select({
      id: schema.decks.id,
      name: schema.decks.name,
      description: schema.decks.description,
      createdAt: schema.decks.createdAt,
      cards: count(schema.cards.id),
      due: count(sql`case when ${schema.cardState.dueAt} <= ${now} then 1 end`),
      fresh: count(sql`case when ${schema.cards.id} is not null and ${schema.cardState.cardId} is null then 1 end`),
    })
    .from(schema.decks)
    .leftJoin(schema.cards, eq(schema.cards.deckId, schema.decks.id))
    .leftJoin(
      schema.cardState,
      and(eq(schema.cardState.cardId, schema.cards.id), eq(schema.cardState.userId, userId)),
    )
    .where(eq(schema.decks.userId, userId))
    .groupBy(schema.decks.id)
    .orderBy(asc(schema.decks.createdAt));
  return rows;
}

export async function getDeck(userId: string, deckId: string) {
  const [deck] = await db
    .select()
    .from(schema.decks)
    .where(and(eq(schema.decks.id, deckId), eq(schema.decks.userId, userId)))
    .limit(1);
  return deck ?? null;
}

export interface CardRow {
  id: string;
  front: string;
  back: string;
  example: string | null;
  note: string | null;
  createdAt: Date;
  state: {
    seen: number;
    correct: number;
    wrong: number;
    firstSeenAt: Date | null;
    lastReviewedAt: Date | null;
    lastResponseMs: number | null;
    dueAt: Date | null;
    halfLifeDays: number | null;
    scheduler: "classic" | "halflife" | null;
  } | null;
}

export async function listCards(userId: string, deckId: string): Promise<CardRow[]> {
  const rows = await db
    .select({
      id: schema.cards.id,
      front: schema.cards.front,
      back: schema.cards.back,
      example: schema.cards.example,
      note: schema.cards.note,
      createdAt: schema.cards.createdAt,
      seen: schema.cardState.seen,
      correct: schema.cardState.correct,
      wrong: schema.cardState.wrong,
      firstSeenAt: schema.cardState.firstSeenAt,
      lastReviewedAt: schema.cardState.lastReviewedAt,
      lastResponseMs: schema.cardState.lastResponseMs,
      dueAt: schema.cardState.dueAt,
      halfLifeDays: schema.cardState.halfLifeDays,
      scheduler: schema.cardState.scheduler,
    })
    .from(schema.cards)
    .leftJoin(
      schema.cardState,
      and(eq(schema.cardState.cardId, schema.cards.id), eq(schema.cardState.userId, userId)),
    )
    .where(eq(schema.cards.deckId, deckId))
    .orderBy(asc(schema.cards.position), asc(schema.cards.createdAt));
  return rows.map(({ seen, correct, wrong, firstSeenAt, lastReviewedAt, lastResponseMs, dueAt, halfLifeDays, scheduler, ...card }) => ({
    ...card,
    state:
      seen === null
        ? null
        : { seen, correct: correct!, wrong: wrong!, firstSeenAt, lastReviewedAt, lastResponseMs, dueAt, halfLifeDays, scheduler },
  }));
}

export async function countDue(userId: string, deckId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.cardState)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.cardState.cardId))
    .where(and(eq(schema.cardState.userId, userId), eq(schema.cards.deckId, deckId), lte(schema.cardState.dueAt, now)));
  return row?.n ?? 0;
}

export async function countDueBefore(userId: string, deckId: string, before: Date): Promise<number> {
  return countDue(userId, deckId, before);
}

export async function countNeverSeen(userId: string, deckId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.cards)
    .leftJoin(
      schema.cardState,
      and(eq(schema.cardState.cardId, schema.cards.id), eq(schema.cardState.userId, userId)),
    )
    .where(and(eq(schema.cards.deckId, deckId), isNull(schema.cardState.cardId)));
  return row?.n ?? 0;
}

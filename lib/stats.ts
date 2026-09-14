import { and, count, eq, gte, isNotNull, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { ymd } from "@/lib/format";

export const CALIBRATION_MIN_REVIEWS = 200;
const DAY_MS = 86_400_000;

export interface DayCount {
  day: string;
  reviews: number;
}

export interface SchedulerStat {
  scheduler: "classic" | "halflife";
  reviews: number;
  retention: number | null;
  meanGapDays: number | null;
}

export interface CalibrationBin {
  bin: string;
  predicted: number;
  observed: number;
  n: number;
}

export interface Stats {
  totalReviews: number;
  dueReviews: number;
  retention: number | null;
  perDay: DayCount[];
  bySchedulerCount: SchedulerStat[];
  calibration: CalibrationBin[] | null;
  predictedReviews: number;
}

function scope(userId: string, deckId: string | null) {
  return deckId
    ? and(eq(schema.reviews.userId, userId), eq(schema.cards.deckId, deckId))
    : eq(schema.reviews.userId, userId);
}

export async function getStats(userId: string, deckId: string | null, timeZone = "UTC", now = new Date()): Promise<Stats> {
  const since = new Date(now.getTime() - 89 * DAY_MS);
  const [totals] = await db
    .select({
      total: count(),
      due: count(sql`case when ${schema.reviews.seenBefore} > 0 then 1 end`),
      dueRemembered: count(sql`case when ${schema.reviews.seenBefore} > 0 and ${schema.reviews.remembered} then 1 end`),
      predicted: count(sql`case when ${schema.reviews.pPredicted} is not null then 1 end`),
    })
    .from(schema.reviews)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.reviews.cardId))
    .where(scope(userId, deckId));

  const perDayRows = await db
    .select({
      day: sql<string>`to_char(${schema.reviews.reviewedAt} at time zone ${timeZone}, 'YYYY-MM-DD')`,
      reviews: count(),
    })
    .from(schema.reviews)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.reviews.cardId))
    .where(and(scope(userId, deckId), gte(schema.reviews.reviewedAt, since)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  const byDay = new Map(perDayRows.map((r) => [r.day, r.reviews]));
  const perDay: DayCount[] = [];
  for (let i = 89; i >= 0; i--) {
    const key = ymd(new Date(now.getTime() - i * DAY_MS), timeZone);
    perDay.push({ day: key, reviews: byDay.get(key) ?? 0 });
  }

  const bySched = await db
    .select({
      scheduler: schema.reviews.scheduler,
      reviews: count(),
      remembered: count(sql`case when ${schema.reviews.remembered} then 1 end`),
      meanGap: sql<number | null>`avg(${schema.reviews.deltaSeconds}) / 86400.0`,
    })
    .from(schema.reviews)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.reviews.cardId))
    .where(and(scope(userId, deckId), isNotNull(schema.reviews.scheduler), sql`${schema.reviews.seenBefore} > 0`))
    .groupBy(schema.reviews.scheduler);
  const bySchedulerCount: SchedulerStat[] = (["classic", "halflife"] as const).map((name) => {
    const row = bySched.find((r) => r.scheduler === name);
    return {
      scheduler: name,
      reviews: row?.reviews ?? 0,
      retention: row && row.reviews > 0 ? row.remembered / row.reviews : null,
      meanGapDays: row?.meanGap === null || row?.meanGap === undefined ? null : Number(row.meanGap),
    };
  });

  let calibration: CalibrationBin[] | null = null;
  const predicted = totals?.predicted ?? 0;
  if (predicted >= CALIBRATION_MIN_REVIEWS) {
    const bins = await db
      .select({
        bin: sql<number>`least(9, floor(${schema.reviews.pPredicted} * 10))`,
        predicted: sql<number>`avg(${schema.reviews.pPredicted})`,
        observed: sql<number>`avg(case when ${schema.reviews.remembered} then 1.0 else 0.0 end)`,
        n: count(),
      })
      .from(schema.reviews)
      .innerJoin(schema.cards, eq(schema.cards.id, schema.reviews.cardId))
      .where(and(scope(userId, deckId), isNotNull(schema.reviews.pPredicted)))
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    calibration = bins.map((b) => ({
      bin: `${(Number(b.bin) / 10).toFixed(1)} to ${((Number(b.bin) + 1) / 10).toFixed(1)}`,
      predicted: Number(b.predicted),
      observed: Number(b.observed),
      n: b.n,
    }));
  }

  return {
    totalReviews: totals?.total ?? 0,
    dueReviews: totals?.due ?? 0,
    retention: totals && totals.due > 0 ? totals.dueRemembered / totals.due : null,
    perDay,
    bySchedulerCount,
    calibration,
    predictedReviews: predicted,
  };
}

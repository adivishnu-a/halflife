import { and, eq, lt, notInArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";

const DAY_MS = 86_400_000;
export const GUEST_IDLE_DAYS = 90;

/**
 * Vercel Cron, daily. Deletes guest accounts with no review in 90 days and
 * nothing created in the last 90 days either. Cascades take their decks,
 * cards and sessions. Named accounts are never touched.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const cutoff = new Date(Date.now() - GUEST_IDLE_DAYS * DAY_MS);
  const recentlyActive = db
    .select({ userId: schema.reviews.userId })
    .from(schema.reviews)
    .where(sql`${schema.reviews.reviewedAt} >= ${cutoff}`);
  const deleted = await db
    .delete(schema.user)
    .where(
      and(
        eq(schema.user.isAnonymous, true),
        lt(schema.user.createdAt, cutoff),
        notInArray(schema.user.id, recentlyActive),
      ),
    )
    .returning({ id: schema.user.id });
  console.info(`[purge] deleted ${deleted.length} idle guest accounts`);
  return Response.json({ deleted: deleted.length, cutoff: cutoff.toISOString() });
}

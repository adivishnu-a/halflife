/**
 * Failed attempts per username, on top of Better Auth's per-IP limiter.
 *
 * The IP limiter alone lets many addresses each take their ten guesses at
 * one account. This counts failures against the username itself, in the
 * same rate_limit table, with a fixed one-minute window. A success clears it.
 */

import { eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";

const WINDOW_MS = 60_000;
const MAX_FAILURES = { signin: 10, recovery: 5 } as const;

type Kind = keyof typeof MAX_FAILURES;

const key = (kind: Kind, username: string) => `${kind}|user|${username.trim().toLowerCase()}`;

export async function isLocked(kind: Kind, username: string): Promise<boolean> {
  const [row] = await db
    .select({ count: schema.rateLimit.count, lastRequest: schema.rateLimit.lastRequest })
    .from(schema.rateLimit)
    .where(eq(schema.rateLimit.key, key(kind, username)))
    .limit(1);
  return !!row && row.count >= MAX_FAILURES[kind] && Date.now() - row.lastRequest < WINDOW_MS;
}

export async function recordFailure(kind: Kind, username: string): Promise<void> {
  const now = Date.now();
  await db
    .insert(schema.rateLimit)
    .values({ id: crypto.randomUUID(), key: key(kind, username), count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: schema.rateLimit.key,
      set: {
        count: sql`case when ${schema.rateLimit.lastRequest} < ${now - WINDOW_MS} then 1 else ${schema.rateLimit.count} + 1 end`,
        lastRequest: now,
      },
    });
}

export async function clearFailures(kind: Kind, username: string): Promise<void> {
  await db.delete(schema.rateLimit).where(eq(schema.rateLimit.key, key(kind, username)));
}

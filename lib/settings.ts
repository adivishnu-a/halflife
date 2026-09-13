import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";

export type Settings = typeof schema.settings.$inferSelect;

export const RETENTION_MIN = 0.8;
export const RETENTION_MAX = 0.95;
export const NEW_PER_DAY_MAX = 100;

export const DEFAULT_SETTINGS = {
  targetRetention: 0.9,
  newPerDay: 10,
  scheduler: "classic" as const,
  shareLogs: true,
};

export async function getSettings(userId: string): Promise<Settings> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId)).limit(1);
  return row ?? { userId, ...DEFAULT_SETTINGS };
}

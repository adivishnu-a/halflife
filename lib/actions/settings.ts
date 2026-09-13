"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/decks";
import { db, schema } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { DEFAULT_SETTINGS, NEW_PER_DAY_MAX, RETENTION_MAX, RETENTION_MIN } from "@/lib/settings";

export async function saveSettings(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const retention = Number(form.get("targetRetention"));
  const newPerDay = Number(form.get("newPerDay"));
  const scheduler = form.get("scheduler");
  const shareLogs = form.get("shareLogs") === "on";
  if (!Number.isFinite(retention) || retention < RETENTION_MIN - 1e-9 || retention > RETENTION_MAX + 1e-9) {
    return { ok: false, message: `Target retention must be between ${RETENTION_MIN * 100}% and ${RETENTION_MAX * 100}%.` };
  }
  if (!Number.isInteger(newPerDay) || newPerDay < 0 || newPerDay > NEW_PER_DAY_MAX) {
    return { ok: false, message: `New cards per day must be a whole number from 0 to ${NEW_PER_DAY_MAX}.` };
  }
  if (scheduler !== "classic" && scheduler !== "halflife") return { ok: false, message: "Pick a scheduler." };
  const chosen: "classic" | "halflife" = scheduler;
  const values = { targetRetention: Math.round(retention * 100) / 100, newPerDay, scheduler: chosen, shareLogs };
  await db
    .insert(schema.settings)
    .values({ userId, ...DEFAULT_SETTINGS, ...values })
    .onConflictDoUpdate({ target: schema.settings.userId, set: values });
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true, message: "Saved." };
}

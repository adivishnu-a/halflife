"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/session";

/** Delete the guest account and everything in it. Named accounts go through Better Auth with a password. */
export async function deleteGuestAccount(): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.user.isAnonymous) redirect("/account");
  await db.delete(schema.user).where(eq(schema.user.id, session.user.id));
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

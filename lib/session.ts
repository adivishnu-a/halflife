import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

/** The current session, or null. Cached for the request so layouts and pages share one lookup. */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** The current user id, or a redirect to the start page which creates a guest session. */
export async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/");
  return session.user.id;
}

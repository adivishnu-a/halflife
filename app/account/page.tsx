import type { Metadata } from "next";

import { AccountPanel } from "@/components/account-panel";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  const user = session?.user ?? null;
  const named = !!user && !user.isAnonymous && !!user.username;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{named ? "Account" : "Keep my progress"}</h1>
      <AccountPanel username={named ? user.username! : null} hasSession={!!user} />
    </div>
  );
}

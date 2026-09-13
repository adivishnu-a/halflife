import type { Metadata } from "next";

import { SettingsForm } from "@/components/settings-form";
import { requireUserId } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const settings = await getSettings(userId);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm settings={settings} />
    </div>
  );
}

import type { Metadata } from "next";

import { RecoverForm } from "@/components/recover-form";

export const metadata: Metadata = { title: "Recover account" };

export default function RecoverPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-3xl font-bold">Recover with your code</h1>
      <p className="muted">Enter your username, the recovery code you saved, and a new password. You will be signed in here and out everywhere else.</p>
      <RecoverForm />
    </div>
  );
}

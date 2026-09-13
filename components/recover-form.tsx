"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth/client";

export function RecoverForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await authClient.recovery.reset({
        username: String(form.get("username") ?? "").trim(),
        code: String(form.get("code") ?? ""),
        newPassword: String(form.get("newPassword") ?? ""),
      });
      if (res.error) {
        setError(res.error.status === 429 ? "Too many attempts. Wait a minute." : "That username and recovery code do not match.");
      } else {
        setNewCode(res.data?.code ?? null);
        router.refresh();
      }
    } catch {
      setError("The server did not answer. Try again in a moment.");
    } finally {
      setPending(false);
    }
  };

  if (newCode) {
    return (
      <section className="sheet rise p-5 sm:p-6" aria-live="polite">
        <h2 className="text-lg font-semibold">Password changed. Here is your new recovery code</h2>
        <p className="mt-1 text-sm muted">The old one no longer works. Save this one; it is shown once.</p>
        <p className="mt-4 select-all break-all rounded-md border border-line bg-paper-2 p-4 font-mono text-xl tracking-wide">{newCode}</p>
        <button
          type="button"
          className="btn btn-primary mt-4"
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
        >
          I saved it, take me to my decks
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="sheet space-y-3 p-5 sm:p-6">
      <div>
        <label htmlFor="rc-username" className="label">Username</label>
        <input id="rc-username" name="username" className="field" autoComplete="username" required spellCheck={false} />
      </div>
      <div>
        <label htmlFor="rc-code" className="label">Recovery code</label>
        <input id="rc-code" name="code" className="field font-mono" autoComplete="one-time-code" required spellCheck={false} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" />
      </div>
      <div>
        <label htmlFor="rc-password" className="label">New password</label>
        <input id="rc-password" name="newPassword" type="password" className="field" autoComplete="new-password" required minLength={8} maxLength={128} />
        <p className="mt-1 text-xs faint">At least 8 characters.</p>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Checking" : "Set new password and sign in"}
      </button>
      {error && <p role="alert" className="text-sm text-forgot">{error}</p>}
    </form>
  );
}

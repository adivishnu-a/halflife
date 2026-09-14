"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { deleteGuestAccount } from "@/lib/actions/account";
import { authClient } from "@/lib/auth/client";
import { FieldError, useValidation } from "@/lib/validate";

const USERNAME_RULE = /^[a-z0-9_]{3,24}$/i;

export function AccountPanel({ username, hasSession }: { username: string | null; hasSession: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  if (code) return <RecoveryCodeOnce code={code} onDone={() => setCode(null)} />;
  return username ? <SignedIn username={username} onNewCode={setCode} /> : <Guest hasSession={hasSession} onCode={setCode} />;
}

function useSubmit<T>(run: (form: FormData) => Promise<T | { error: string }>, after: (r: T) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validation = useValidation();
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    if (!validation.validate(e.currentTarget)) return;
    setPending(true);
    setError(null);
    try {
      const r = await run(new FormData(e.currentTarget));
      if (r && typeof r === "object" && "error" in r && typeof r.error === "string") setError(r.error);
      else after(r as T);
    } catch {
      setError("The server did not answer. Try again in a moment.");
    } finally {
      setPending(false);
    }
  };
  return { pending, error, onSubmit, errors: validation.errors, clear: validation.clear };
}

function Guest({ hasSession, onCode }: { hasSession: boolean; onCode: (c: string) => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "signin">("create");

  const signUp = useSubmit(
    async (form) => {
      const username = String(form.get("username") ?? "").trim();
      const password = String(form.get("password") ?? "");
      if (!USERNAME_RULE.test(username)) return { error: "A username is 3 to 24 letters, digits or underscores." };
      if (password.length < 8) return { error: "Use at least 8 characters for the password." };
      const res = await authClient.signUp.email({
        email: `${username.toLowerCase()}@users.halflife.invalid`,
        name: username,
        username,
        password,
      });
      if (res.error) {
        const msg = res.error.message ?? "";
        return { error: /username/i.test(msg) && /taken|exist/i.test(msg) ? "That username is taken." : msg || "Could not create the account." };
      }
      const rc = await authClient.recovery.generate();
      if (rc.error || !rc.data?.code) return { error: "The account exists but no recovery code came back. Get one from the account page." };
      return rc.data.code;
    },
    (code) => {
      onCode(code);
      router.refresh();
    },
  );

  const signIn = useSubmit(
    async (form) => {
      const res = await authClient.signIn.username({
        username: String(form.get("username") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      });
      if (res.error) return { error: res.error.status === 429 ? "Too many attempts. Wait a minute." : "That username and password do not match." };
      return true;
    },
    () => {
      router.push("/");
      router.refresh();
    },
  );

  const tabClass = (active: boolean) =>
    `min-h-11 flex-1 rounded-md px-3 text-sm font-semibold transition-colors ${active ? "bg-accent text-on-accent" : "muted hover:bg-paper-2 hover:text-ink"}`;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div role="tablist" aria-label="Account" className="panel flex gap-1 p-1">
        <button type="button" role="tab" id="tab-create" aria-selected={tab === "create"} aria-controls="panel-create" className={tabClass(tab === "create")} onClick={() => setTab("create")}>
          Create account
        </button>
        <button type="button" role="tab" id="tab-signin" aria-selected={tab === "signin"} aria-controls="panel-signin" className={tabClass(tab === "signin")} onClick={() => setTab("signin")}>
          Sign in
        </button>
      </div>

      {tab === "create" ? (
        <section id="panel-create" role="tabpanel" aria-labelledby="tab-create" className="sheet p-5 sm:p-6">
          <h2 className="text-lg font-bold">Pick a username and password</h2>
          <p className="mt-1 text-sm muted">
            {hasSession ? "Everything in this browser comes with you. " : ""}No email, nothing to verify.
          </p>
          <form onSubmit={signUp.onSubmit} noValidate className="mt-4 space-y-3">
            <div>
              <label htmlFor="su-username" className="label">Username</label>
              <input id="su-username" name="username" className="field" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" spellCheck={false} data-message="A username is 3 to 24 letters, digits or underscores." onInput={() => signUp.clear("username")} />
              <FieldError id="su-username-error" message={signUp.errors.username} />
              <p className="mt-1 text-xs faint">3 to 24 letters, digits or underscores.</p>
            </div>
            <div>
              <label htmlFor="su-password" className="label">Password</label>
              <input id="su-password" name="password" type="password" className="field" autoComplete="new-password" required minLength={8} maxLength={128} data-message="Use at least 8 characters for the password." onInput={() => signUp.clear("password")} />
              <FieldError id="su-password-error" message={signUp.errors.password} />
              <p className="mt-1 text-xs faint">At least 8 characters.</p>
            </div>
            <p className="text-sm muted">
              There is no password reset by email. You get one recovery code next; without it a lost password means a lost
              account.
            </p>
            <button type="submit" className="btn btn-primary w-full" disabled={signUp.pending}>
              {signUp.pending ? "Creating your account" : "Create account"}
            </button>
            {signUp.error && <p role="alert" className="text-sm text-forgot">{signUp.error}</p>}
          </form>
        </section>
      ) : (
        <section id="panel-signin" role="tabpanel" aria-labelledby="tab-signin" className="sheet p-5 sm:p-6">
          <h2 className="text-lg font-bold">Sign in</h2>
          <p className="mt-1 text-sm muted">
            {hasSession ? "This browser's decks move into that account." : "Pick up where you left off."}
          </p>
          <form onSubmit={signIn.onSubmit} noValidate className="mt-4 space-y-3">
            <div>
              <label htmlFor="si-username" className="label">Username</label>
              <input id="si-username" name="username" className="field" autoComplete="username" required spellCheck={false} onInput={() => signIn.clear("username")} />
              <FieldError id="si-username-error" message={signIn.errors.username} />
            </div>
            <div>
              <label htmlFor="si-password" className="label">Password</label>
              <input id="si-password" name="password" type="password" className="field" autoComplete="current-password" required onInput={() => signIn.clear("password")} />
              <FieldError id="si-password-error" message={signIn.errors.password} />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={signIn.pending}>
              {signIn.pending ? "Signing in" : "Sign in"}
            </button>
            {signIn.error && <p role="alert" className="text-sm text-forgot">{signIn.error}</p>}
            <p className="text-center text-sm">
              <Link href="/account/recover" className="underline">Forgot the password? Use your recovery code</Link>
            </p>
          </form>
        </section>
      )}

      {hasSession && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm muted">Delete this guest session</summary>
          <form action={deleteGuestAccount} className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span>Removes every deck and review made in this browser. There is no undo.</span>
            <button type="submit" className="btn btn-danger">Delete guest session and its data</button>
          </form>
        </details>
      )}
    </div>
  );
}

function SignedIn({ username, onNewCode }: { username: string; onNewCode: (c: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (name: string, fn: () => Promise<{ error?: { message?: string } | null } | void>, then?: () => void) => {
    setBusy(name);
    setError(null);
    try {
      const r = await fn();
      if (r && r.error) setError(r.error.message ?? "That did not work.");
      else then?.();
    } catch {
      setError("The server did not answer. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  const del = useSubmit(
    async (form) => {
      const res = await authClient.deleteUser({ password: String(form.get("password") ?? "") });
      if (res.error) return { error: "That password is wrong, so nothing was deleted." };
      return true;
    },
    () => {
      router.push("/");
      router.refresh();
    },
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <section className="sheet p-5 sm:p-6">
        <p>
          Signed in as <strong>{username}</strong>. Your decks and reviews are saved to this account and open on any device.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() =>
              run("out", () => authClient.signOut(), () => {
                router.push("/");
                router.refresh();
              })
            }>
            Sign out
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => run("all", () => authClient.revokeOtherSessions(), () => setError(null))}>
            Sign out other devices
          </button>
          <a href="/account/export" download className="btn btn-secondary">Export my data</a>
        </div>
      </section>

      <section className="sheet p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Recovery code</h2>
        <p className="mt-1 text-sm muted">
          The only way back in without the password. Getting a new one cancels the old one.
        </p>
        <button
          type="button"
          className="btn btn-secondary mt-3"
          disabled={busy !== null}
          onClick={() =>
            run("code", async () => {
              const rc = await authClient.recovery.generate();
              if (rc.error || !rc.data?.code) return { error: { message: "No code came back. Try again." } };
              onNewCode(rc.data.code);
            })
          }
        >
          {busy === "code" ? "Making a new code" : "Get a new recovery code"}
        </button>
      </section>

      <section className="sheet p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Delete account</h2>
        <p className="mt-1 text-sm muted">Deletes the account, every deck, every review. Export first if you want a copy. There is no undo.</p>
        {confirmDelete ? (
          <form onSubmit={del.onSubmit} noValidate className="mt-3 space-y-3">
            <div>
              <label htmlFor="del-password" className="label">Password to confirm</label>
              <input id="del-password" name="password" type="password" className="field max-w-sm" autoComplete="current-password" required data-message="Type your password to confirm." onInput={() => del.clear("password")} />
              <FieldError id="del-password-error" message={del.errors.password} />
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn btn-danger" disabled={del.pending}>
                {del.pending ? "Deleting" : "Delete account and all data"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep my account</button>
            </div>
            {del.error && <p role="alert" className="text-sm text-forgot">{del.error}</p>}
          </form>
        ) : (
          <button type="button" className="btn btn-danger mt-3" onClick={() => setConfirmDelete(true)}>Delete account</button>
        )}
      </section>
      {error && <p role="alert" className="text-sm text-forgot">{error}</p>}
    </div>
  );
}

function RecoveryCodeOnce({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="sheet rise p-5 sm:p-6" aria-live="polite">
      <h2 className="text-lg font-semibold">Save this recovery code</h2>
      <p className="mt-1 text-sm muted">
        It is shown once. It signs you in if you forget your password. Halflife cannot recover it for you.
      </p>
      <p className="mt-4 select-all break-all rounded-md border border-line bg-paper-2 p-4 font-mono text-xl tracking-wide">{code}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigator.clipboard?.writeText(code).then(() => setCopied(true), () => setCopied(false))}
        >
          {copied ? "Copied" : "Copy code"}
        </button>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          I saved it
        </button>
      </div>
    </section>
  );
}

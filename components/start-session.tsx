"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth/client";

/**
 * First visit: create a silent guest session, then re-render the page with it.
 * Nothing is asked of the visitor. If it fails, say so and offer a retry.
 */
export function StartSession() {
  const router = useRouter();
  // The attempt counter drives the effect; failure is stored with the attempt it belongs to.
  const [attempt, setAttempt] = useState(0);
  const [failedAttempt, setFailedAttempt] = useState(-1);
  const failed = failedAttempt === attempt;
  const started = useRef(-1);

  useEffect(() => {
    // Strict mode runs effects twice in development; one guest per attempt is enough.
    if (started.current === attempt) return;
    started.current = attempt;
    authClient.signIn.anonymous().then(({ error }) => {
      if (error) setFailedAttempt(attempt);
      else router.refresh();
    });
  }, [attempt, router]);

  if (failed) {
    return (
      <div role="alert" className="stock p-6">
        <h1 className="text-xl font-semibold">Could not start a session</h1>
        <p className="mt-2 muted">
          The database did not answer. Nothing was saved. Try again in a moment.
        </p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <p className="sr-only">Setting things up</p>
      <div className="h-8 w-40 animate-pulse rounded-md bg-paper-2" />
      <div className="h-24 animate-pulse rounded-lg bg-paper-2" />
      <div className="h-24 animate-pulse rounded-lg bg-paper-2" />
    </div>
  );
}

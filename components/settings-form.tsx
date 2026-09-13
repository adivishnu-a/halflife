"use client";

import { useActionState, useState } from "react";

import { saveSettings } from "@/lib/actions/settings";
import { formatPercent } from "@/lib/format";
import type { Settings } from "@/lib/settings";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveSettings, null);
  const [retention, setRetention] = useState(settings.targetRetention);

  return (
    <form action={action} className="space-y-8">
      <section className="card space-y-6 p-5 sm:p-6">
        <div>
          <label htmlFor="targetRetention" className="label">
            Target retention: <output className="font-semibold text-ink tabular-nums">{formatPercent(retention)}</output>
          </label>
          <input
            id="targetRetention"
            name="targetRetention"
            type="range"
            min={0.8}
            max={0.95}
            step={0.01}
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
            className="w-full accent-ink"
          />
          <p className="mt-2 text-sm muted">
            The chance of remembering a card on the day it comes back. Higher means more reviews. The Halflife scheduler
            uses this directly; Classic ignores it.
          </p>
        </div>

        <div>
          <label htmlFor="newPerDay" className="label">
            New cards per day
          </label>
          <input
            id="newPerDay"
            name="newPerDay"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            defaultValue={settings.newPerDay}
            className="field max-w-32"
          />
          <p className="mt-2 text-sm muted">Cards you have never seen, added to the queue after everything due.</p>
        </div>

        <fieldset>
          <legend className="label">Scheduler</legend>
          <div className="space-y-2">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line p-3 has-[:checked]:border-ink">
              <input type="radio" name="scheduler" value="classic" defaultChecked={settings.scheduler === "classic"} className="mt-1 accent-ink" />
              <span>
                <span className="font-medium">Classic</span>
                <span className="block text-sm muted">
                  SM-2, the 1987 formula Anki is built on. Gaps of 1 day, 6 days, then times an ease factor. The default until
                  the model beats it on this app&apos;s own reviews.
                </span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line p-3 has-[:checked]:border-ink">
              <input type="radio" name="scheduler" value="halflife" defaultChecked={settings.scheduler === "halflife"} className="mt-1 accent-ink" />
              <span>
                <span className="font-medium">Halflife</span>
                <span className="block text-sm muted">
                  The trained model. Predicts each card&apos;s half-life from your history and brings it back when recall is
                  predicted to fall to your target. Trained on Duolingo traces, which carry little spacing signal, so its
                  gaps are cautious until it is retrained on real flashcard reviews.
                </span>
              </span>
            </label>
          </div>
          <p className="mt-2 text-sm muted">
            Whichever you pick, every review also records what the model would have said, so the two can be compared in
            Stats.
          </p>
        </fieldset>

        <div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" name="shareLogs" defaultChecked={settings.shareLogs} className="mt-1 accent-ink" />
            <span>
              <span className="font-medium">Share anonymised review logs for retraining</span>
              <span className="block text-sm muted">
                On unless you turn it off. What leaves your account: for each review, the counts of times seen and
                remembered, the gap in days, the response time, the outcome, and a random id for the card. Never the card
                text, your username, or anything that identifies you.
              </span>
            </span>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving" : "Save settings"}
        </button>
        {state?.message && (
          <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-remembered" : "text-forgot"}`}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

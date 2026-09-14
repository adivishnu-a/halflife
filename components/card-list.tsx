"use client";

import { useActionState } from "react";

import { WhyThisDate } from "@/components/why-this-date";
import { deleteCard, updateCard } from "@/lib/actions/decks";
import type { CardRow } from "@/lib/decks";
import { formatDue } from "@/lib/format";
import { FieldError, useValidation } from "@/lib/validate";

export function CardList({
  cards,
  targetRetention,
  now: nowMs,
}: {
  cards: CardRow[];
  targetRetention: number;
  /** Render time from the server, so server and client compute the same numbers. */
  now: number;
}) {
  if (cards.length === 0) {
    return (
      <p className="sheet p-5 muted">
        No cards yet. Add one above, or import a CSV.
      </p>
    );
  }
  const now = new Date(nowMs);
  return (
    <ul className="divide-y divide-line border-y border-line">
      {cards.map((card) => (
        <li key={card.id}>
          <details className="group">
            <summary className="min-h-11 cursor-pointer flex-wrap gap-x-4 gap-y-1 py-3 hover:bg-paper-2">
              <span className="min-w-0 flex-1 break-words font-medium">{card.front}</span>
              <span className="min-w-0 flex-1 break-words muted">{card.back}</span>
              <span className="w-full text-xs faint sm:w-auto sm:text-right">
                {!card.state
                  ? "new"
                  : card.state.dueAt
                    ? `due ${formatDue(card.state.dueAt, now)}`
                    : "seen"}
              </span>
            </summary>
            <div className="grid gap-6 pb-5 pt-2 sm:grid-cols-2">
              <CardEditor card={card} />
              <div>
                <h3 className="mb-2 text-sm font-medium">Why this date</h3>
                {card.state ? (
                  <WhyThisDate state={card.state} targetRetention={targetRetention} now={now} />
                ) : (
                  <p className="text-sm muted">Not reviewed yet. After the first review the model predicts a half-life and the scheduler sets a date.</p>
                )}
              </div>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function CardEditor({ card }: { card: CardRow }) {
  const [state, action, pending] = useActionState(updateCard, null);
  const { errors, formProps, clear } = useValidation();
  const id = (f: string) => `${f}-${card.id}`;
  return (
    <form {...formProps} action={action} className="space-y-3">
      <input type="hidden" name="cardId" value={card.id} />
      {(["front", "back", "example", "note"] as const).map((f) => (
        <div key={f}>
          <label htmlFor={id(f)} className="label capitalize">
            {f}
          </label>
          <input
            id={id(f)}
            name={f}
            className="field"
            defaultValue={card[f] ?? ""}
            required={f === "front" || f === "back"}
            maxLength={f === "front" || f === "back" ? 500 : 1000}
            onInput={() => clear(f)}
          />
          <FieldError id={`${id(f)}-error`} message={errors[f]} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Saving" : "Save card"}
        </button>
        <button type="submit" formAction={deleteCard} className="btn btn-ghost text-forgot">
          Delete card
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

"use client";

import { useActionState } from "react";

import { createDeck } from "@/lib/actions/decks";

export function DeckForm() {
  const [state, action, pending] = useActionState(createDeck, null);
  return (
    <form action={action} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="deck-name" className="label">
          Deck name
        </label>
        <input
          id="deck-name"
          name="name"
          className="field"
          placeholder="Spanish verbs"
          required
          maxLength={80}
          autoComplete="off"
          aria-invalid={state?.ok === false ? "true" : undefined}
          aria-describedby={state?.message ? "deck-name-message" : undefined}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Creating" : "Create deck"}
      </button>
      {state?.message && (
        <p id="deck-name-message" role="alert" className="text-sm text-forgot sm:basis-full">
          {state.message}
        </p>
      )}
    </form>
  );
}

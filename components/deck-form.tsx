"use client";

import { useActionState } from "react";

import { createDeck } from "@/lib/actions/decks";
import { FieldError, useValidation } from "@/lib/validate";

export function DeckForm() {
  const [state, action, pending] = useActionState(createDeck, null);
  const { errors, formProps, clear } = useValidation();
  return (
    <form {...formProps} action={action} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
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
          data-message="Give the deck a name."
          onInput={() => clear("name")}
          aria-describedby={errors.name ? "deck-name-error" : state?.message ? "deck-name-message" : undefined}
        />
        <FieldError id="deck-name-error" message={errors.name} />
      </div>
      <button type="submit" className="btn btn-primary sm:mt-[1.85rem]" disabled={pending}>
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

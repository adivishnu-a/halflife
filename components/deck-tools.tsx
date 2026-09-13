"use client";

import { useActionState, useState } from "react";

import { addCard, deleteDeck, importCards, renameDeck } from "@/lib/actions/decks";

function Message({ id, state }: { id: string; state: { ok: boolean; message?: string } | null }) {
  if (!state?.message) return null;
  return (
    <p id={id} role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-remembered" : "text-forgot"}`}>
      {state.message}
    </p>
  );
}

export function DeckTools({ deckId, deckName, cardCount }: { deckId: string; deckName: string; cardCount: number }) {
  const [addState, addAction, adding] = useActionState(addCard, null);
  const [importState, importAction, importing] = useActionState(importCards, null);
  const [renameState, renameAction, renaming] = useActionState(renameDeck, null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="text-base font-medium">Add a card</h2>
        <form action={addAction} className="mt-3 grid gap-3 sm:grid-cols-2" key={addState?.ok ? addState.message : "add"}>
          <input type="hidden" name="deckId" value={deckId} />
          <div>
            <label htmlFor="front" className="label">Front</label>
            <input id="front" name="front" className="field" required maxLength={500} autoComplete="off" placeholder="das Haus" />
          </div>
          <div>
            <label htmlFor="back" className="label">Back</label>
            <input id="back" name="back" className="field" required maxLength={500} autoComplete="off" placeholder="the house" />
          </div>
          <div>
            <label htmlFor="example" className="label">Example <span className="faint">optional</span></label>
            <input id="example" name="example" className="field" maxLength={1000} autoComplete="off" placeholder="Das Haus ist alt." />
          </div>
          <div>
            <label htmlFor="note" className="label">Note <span className="faint">optional</span></label>
            <input id="note" name="note" className="field" maxLength={1000} autoComplete="off" placeholder="Plural: die Häuser" />
          </div>
          <div className="flex items-center gap-4 sm:col-span-2">
            <button type="submit" className="btn btn-primary" disabled={adding}>
              {adding ? "Adding" : "Add card"}
            </button>
            <Message id="add-message" state={addState} />
          </div>
        </form>
      </section>

      <details className="card group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-5 py-3 text-base font-medium marker:hidden">
          Import, export, rename, delete
          <span aria-hidden="true" className="text-sm faint group-open:hidden">show</span>
          <span aria-hidden="true" className="hidden text-sm faint group-open:inline">hide</span>
        </summary>
        <div className="space-y-6 border-t border-line px-5 py-5">
          <form action={importAction} className="space-y-3">
            <input type="hidden" name="deckId" value={deckId} />
            <div>
              <label htmlFor="file" className="label">Import a CSV</label>
              <p className="mb-2 text-sm muted">Columns front, back, example, note. A header row is optional. Up to 2,000 cards per file.</p>
              <input id="file" name="file" type="file" accept=".csv,text/csv" className="field py-2" required />
            </div>
            <div className="flex items-center gap-4">
              <button type="submit" className="btn btn-secondary" disabled={importing}>
                {importing ? "Importing" : "Import cards"}
              </button>
              <Message id="import-message" state={importState} />
            </div>
          </form>

          <div>
            <p className="label">Export</p>
            <a href={`/decks/${deckId}/export`} download className="btn btn-secondary">
              Download {cardCount} {cardCount === 1 ? "card" : "cards"} as CSV
            </a>
          </div>

          <form action={renameAction} className="space-y-3">
            <input type="hidden" name="deckId" value={deckId} />
            <div>
              <label htmlFor="rename" className="label">Deck name</label>
              <input id="rename" name="name" className="field" defaultValue={deckName} required maxLength={80} />
            </div>
            <div className="flex items-center gap-4">
              <button type="submit" className="btn btn-secondary" disabled={renaming}>
                {renaming ? "Saving" : "Rename deck"}
              </button>
              <Message id="rename-message" state={renameState} />
            </div>
          </form>

          <form action={deleteDeck} className="space-y-3">
            <input type="hidden" name="deckId" value={deckId} />
            <p className="label">Delete</p>
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm">This deletes the deck, its {cardCount} cards and their review history. There is no undo.</p>
                <button type="submit" className="btn btn-danger">Delete deck and history</button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </div>
            ) : (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete deck
              </button>
            )}
          </form>
        </div>
      </details>
    </div>
  );
}

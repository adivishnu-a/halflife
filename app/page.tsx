import Link from "next/link";

import { DeckForm } from "@/components/deck-form";
import { StartSession } from "@/components/start-session";
import { copyStarterDeck } from "@/lib/actions/decks";
import { listDecks } from "@/lib/decks";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const session = await getSession();
  if (!session) return <StartSession />;
  const decks = await listDecks(session.user.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Decks</h1>
        {decks.length > 0 && (
          <form action={copyStarterDeck}>
            <button type="submit" className="btn btn-secondary">
              Add the German starter deck
            </button>
          </form>
        )}
      </div>

      {decks.length === 0 ? (
        <section className="card p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Start with a deck</h2>
          <p className="mt-2 max-w-prose muted">
            Halflife shows you a card, you say whether you remembered it, and the scheduler picks the
            day it comes back. Nothing to sign up for. Your progress lives in this browser until you
            keep it with a username.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <form action={copyStarterDeck}>
              <button type="submit" className="btn btn-primary w-full sm:w-auto">
                Copy the German starter deck
              </button>
            </form>
            <span className="self-center text-sm faint">300 common words, CC BY-SA 4.0</span>
          </div>
          <div className="mt-8 border-t border-line pt-6">
            <h3 className="text-base font-medium">Or make your own</h3>
            <DeckForm />
          </div>
        </section>
      ) : (
        <>
          <ul className="space-y-3">
            {decks.map((deck) => (
              <li key={deck.id} className="card">
                <Link
                  href={`/decks/${deck.id}`}
                  className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4 hover:bg-paper-2"
                >
                  <span className="min-w-0 break-words text-lg font-medium">{deck.name}</span>
                  <span className="text-sm muted">
                    {deck.due > 0 ? <strong className="text-ink">{deck.due} due</strong> : "nothing due"}
                    {" · "}
                    {deck.fresh} new · {deck.cards} {deck.cards === 1 ? "card" : "cards"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <section className="card p-5">
            <h2 className="text-base font-medium">New deck</h2>
            <DeckForm />
          </section>
        </>
      )}
    </div>
  );
}

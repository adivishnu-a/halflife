import Link from "next/link";

import { DeckForm } from "@/components/deck-form";
import { DeckTile } from "@/components/deck-tile";
import { StartSession } from "@/components/start-session";
import { copyStarterDeck } from "@/lib/actions/decks";
import { listDecks } from "@/lib/decks";
import { getSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const session = await getSession();
  if (!session) return <StartSession />;
  const [decks, settings] = await Promise.all([listDecks(session.user.id), getSettings(session.user.id)]);
  const dueToday = decks.reduce((n, d) => n + d.due, 0);
  const newToday = decks.reduce((n, d) => n + Math.min(d.fresh, settings.newPerDay), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Decks</h1>
          {decks.length > 0 && (
            <p className="mt-1 muted">
              {dueToday + newToday === 0
                ? "Nothing waiting today."
                : `Today: ${dueToday} due${newToday ? ` and ${newToday} new` : ""}.`}
            </p>
          )}
        </div>
        {decks.length > 0 && (
          <form action={copyStarterDeck}>
            <button type="submit" className="btn btn-secondary">
              Add the German starter deck
            </button>
          </form>
        )}
      </div>

      {decks.length === 0 ? (
        <section className="stock p-6 sm:p-8">
          <h2 className="text-2xl font-bold">Start with a deck</h2>
          <p className="mt-2 max-w-prose muted">
            Halflife shows you a card, you say whether you remembered it, and the scheduler picks the day it comes back.
            Nothing to sign up for. Your progress lives in this browser until you keep it with a username.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <form action={copyStarterDeck}>
              <button type="submit" className="btn btn-primary min-h-12 w-full px-5 text-base sm:w-auto">
                Copy the German starter deck
              </button>
            </form>
            <span className="text-sm faint">300 common words, CC BY-SA 4.0</span>
          </div>
          <div className="mt-8 border-t border-stock-edge pt-6">
            <h3 className="text-base font-semibold">Or make your own</h3>
            <DeckForm />
          </div>
        </section>
      ) : (
        <>
          <ul className="space-y-5">
            {decks.map((deck) => (
              <DeckTile key={deck.id} deck={deck} newPerDay={settings.newPerDay} />
            ))}
          </ul>
          <section className="panel p-5">
            <h2 className="text-base font-semibold">New deck</h2>
            <DeckForm />
          </section>
        </>
      )}
    </div>
  );
}

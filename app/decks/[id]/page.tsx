import Link from "next/link";
import { notFound } from "next/navigation";

import { CardList } from "@/components/card-list";
import { DeckTools } from "@/components/deck-tools";
import { getDeck, listCards } from "@/lib/decks";
import { plural } from "@/lib/format";
import { requireUserId } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { getTimeZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const PAGE = 100;

export default async function DeckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { id } = await params;
  const { show } = await searchParams;
  const userId = await requireUserId();
  const deck = await getDeck(userId, id);
  if (!deck) notFound();
  const [cards, settings, timeZone] = await Promise.all([listCards(userId, id), getSettings(userId), getTimeZone()]);
  const now = new Date();
  const due = cards.filter((c) => c.state?.dueAt && c.state.dueAt <= now).length;
  const fresh = cards.filter((c) => !c.state).length;
  const newToday = Math.min(fresh, settings.newPerDay);
  const queue = due + newToday;
  // The list grows a page at a time through a plain link, so a 300-card deck
  // does not open as a 16,000px page and the URL still says what is shown.
  const shown = Math.min(cards.length, Math.max(PAGE, Number(show) || 0));

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-sm muted">
        <Link href="/" className="hover:underline">
          Decks
        </Link>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-bold">{deck.name}</h1>
          <p className="mt-1 text-sm muted">
            {plural(cards.length, "card", "cards")} · {due} due · {fresh} new
          </p>
        </div>
        {queue > 0 ? (
          <Link href={`/decks/${deck.id}/review`} className="btn btn-primary min-h-12 px-5 text-base">
            Review {queue} {queue === 1 ? "card" : "cards"}
          </Link>
        ) : (
          <span className="btn btn-ghost cursor-default" aria-disabled="true">
            {cards.length === 0 ? "Add cards to review" : "Nothing due today"}
          </span>
        )}
      </div>
      {deck.description && <p className="max-w-prose muted">{deck.description}</p>}

      <DeckTools deckId={deck.id} deckName={deck.name} cardCount={cards.length} />

      <section>
        <h2 className="mb-3 text-xl font-bold">Cards</h2>
        <CardList cards={cards.slice(0, shown)} targetRetention={settings.targetRetention} now={now.getTime()} timeZone={timeZone} />
        {shown < cards.length && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Link href={`/decks/${deck.id}?show=${shown + PAGE}`} scroll={false} className="btn btn-secondary">
              Show the next {Math.min(PAGE, cards.length - shown)}
            </Link>
            <span className="text-sm muted">
              Showing {shown} of {cards.length}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

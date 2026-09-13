import Link from "next/link";
import { notFound } from "next/navigation";

import { ReviewSession } from "@/components/review-session";
import { getDeck } from "@/lib/decks";
import { buildQueue } from "@/lib/queue";
import { requireUserId } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const deck = await getDeck(userId, id);
  if (!deck) notFound();
  const settings = await getSettings(userId);
  const queue = await buildQueue(userId, id, settings);

  if (queue.cards.length === 0) {
    return (
      <div className="space-y-4">
        <nav aria-label="Breadcrumb" className="text-sm muted">
          <Link href="/" className="hover:underline">Decks</Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/decks/${deck.id}`} className="hover:underline">{deck.name}</Link>
        </nav>
        <div className="card p-6">
          <h1 className="text-xl font-semibold">Nothing to review in {deck.name}</h1>
          <p className="mt-2 muted">
            No cards are due and today&apos;s new cards are done. Come back tomorrow, or raise new cards per day in settings.
          </p>
          <Link href={`/decks/${deck.id}`} className="btn btn-secondary mt-4">Back to the deck</Link>
        </div>
      </div>
    );
  }

  return (
    <ReviewSession
      deckId={deck.id}
      deckName={deck.name}
      cards={queue.cards}
      scheduler={settings.scheduler}
      targetRetention={settings.targetRetention}
      predictionSource={queue.predictionSource}
    />
  );
}

import { notFound } from "next/navigation";

import { ReviewSession } from "@/components/review-session";
import { getDeck } from "@/lib/decks";
import { buildQueue } from "@/lib/queue";
import { getSession, requireUserId } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const deck = await getDeck(userId, id);
  if (!deck) notFound();
  const settings = await getSettings(userId);
  const queue = await buildQueue(userId, id, settings);
  const user = (await getSession())?.user;
  const isGuest = !user || !!user.isAnonymous || !user.username;

  // Always the client session, even with an empty queue: grading revalidates
  // paths, which re-renders this page, and the finished session must survive that.
  return (
    <ReviewSession
      deckId={deck.id}
      deckName={deck.name}
      cards={queue.cards}
      scheduler={settings.scheduler}
      targetRetention={settings.targetRetention}
      predictionSource={queue.predictionSource}
      isGuest={isGuest}
    />
  );
}

import Link from "next/link";

import type { DeckSummary } from "@/lib/decks";
import { plural } from "@/lib/format";

/** A deck reads as a small stack: two edges peek out below the tile. The tile follows the theme. */
export function DeckTile({ deck, newPerDay }: { deck: DeckSummary; newPerDay: number }) {
  const queue = deck.due + Math.min(deck.fresh, newPerDay);
  return (
    <li className="relative">
      <div aria-hidden="true" className="stack-ghost deck-ghost two" />
      <div aria-hidden="true" className="stack-ghost deck-ghost one" />
      <div className="sheet relative flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <Link href={`/decks/${deck.id}`} className="block break-words text-xl font-bold hover:underline">
            {deck.name}
          </Link>
          <p className="mt-0.5 text-sm muted">
            {deck.due > 0 ? <strong className="font-semibold text-ink">{deck.due} due</strong> : "nothing due"}
            {" · "}
            {deck.fresh} new · {plural(deck.cards, "card", "cards")}
          </p>
        </div>
        {queue > 0 ? (
          <Link href={`/decks/${deck.id}/review`} className="btn btn-primary">
            Review {queue}
          </Link>
        ) : (
          <Link href={`/decks/${deck.id}`} className="btn btn-ghost">
            Open
          </Link>
        )}
      </div>
    </li>
  );
}

import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/session";

/** Everything the account holds, as JSON. Decks with cards, review history, settings. */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Sign in first", { status: 401 });
  const userId = session.user.id;
  const [decks, cards, states, reviews, settings] = await Promise.all([
    db.select().from(schema.decks).where(eq(schema.decks.userId, userId)),
    db
      .select({ card: schema.cards })
      .from(schema.cards)
      .innerJoin(schema.decks, eq(schema.decks.id, schema.cards.deckId))
      .where(eq(schema.decks.userId, userId)),
    db.select().from(schema.cardState).where(eq(schema.cardState.userId, userId)),
    db.select().from(schema.reviews).where(eq(schema.reviews.userId, userId)),
    db.select().from(schema.settings).where(eq(schema.settings.userId, userId)),
  ]);
  const body = {
    exportedAt: new Date().toISOString(),
    account: { username: session.user.username ?? null, createdAt: session.user.createdAt },
    settings: settings[0] ?? null,
    decks: decks.map((d) => ({ ...d, cards: cards.filter((c) => c.card.deckId === d.id).map((c) => c.card) })),
    cardState: states,
    reviews,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="halflife-export.json"`,
      "cache-control": "no-store",
    },
  });
}

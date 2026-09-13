import { cardsToCsv } from "@/lib/csv";
import { getDeck, listCards } from "@/lib/decks";
import { getSession } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new Response("Sign in first", { status: 401 });
  const deck = await getDeck(session.user.id, id);
  if (!deck) return new Response("Not found", { status: 404 });
  const cards = await listCards(session.user.id, id);
  const slug = deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck";
  return new Response(cardsToCsv(cards), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}.csv"`,
      "cache-control": "no-store",
    },
  });
}

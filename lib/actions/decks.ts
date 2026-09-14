"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import starter from "@/content/decks/german-a1.json";
import { cardsFromCsv } from "@/lib/csv";
import { db, schema } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { requireUserId } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const NAME_MAX = 80;

// Per-account caps. Nothing in the app needs more, and without them one
// scripted guest could fill the free database tier.
const MAX_DECKS = 50;
const MAX_CARDS = 20_000;

async function deckCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.decks)
    .where(eq(schema.decks.userId, userId));
  return row?.n ?? 0;
}

async function cardCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.cards)
    .innerJoin(schema.decks, eq(schema.decks.id, schema.cards.deckId))
    .where(eq(schema.decks.userId, userId));
  return row?.n ?? 0;
}

const deckCapMessage = `This account has ${MAX_DECKS} decks, the most it can hold. Delete one to make room.`;
const cardCapMessage = (have: number, adding: number) =>
  `This account holds ${formatNumber(have)} cards and the limit is ${formatNumber(MAX_CARDS)}. ` +
  (have >= MAX_CARDS ? "Delete some to make room." : `There is room for ${formatNumber(MAX_CARDS - have)}, not ${formatNumber(adding)}.`);

function cleanName(raw: FormDataEntryValue | null): string | null {
  const name = String(raw ?? "").trim();
  return name && name.length <= NAME_MAX ? name : null;
}

export async function createDeck(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const name = cleanName(form.get("name"));
  if (!name) return { ok: false, message: `Give the deck a name, up to ${NAME_MAX} characters.` };
  if ((await deckCount(userId)) >= MAX_DECKS) return { ok: false, message: deckCapMessage };
  const [deck] = await db.insert(schema.decks).values({ userId, name }).returning({ id: schema.decks.id });
  revalidatePath("/");
  redirect(`/decks/${deck!.id}`);
}

export async function copyStarterDeck(): Promise<void> {
  const userId = await requireUserId();
  // One copy per account: a reload that resubmits the form must not make a second.
  const [already] = await db
    .select({ id: schema.decks.id })
    .from(schema.decks)
    .innerJoin(schema.cards, eq(schema.cards.deckId, schema.decks.id))
    .where(and(eq(schema.decks.userId, userId), eq(schema.cards.sourceKey, starter.cards[0]!.key)))
    .limit(1);
  if (already) redirect(`/decks/${already.id}`);
  const deckId = await db.transaction(async (tx) => {
    const [deck] = await tx
      .insert(schema.decks)
      .values({ userId, name: starter.name, description: starter.description })
      .returning({ id: schema.decks.id });
    await tx.insert(schema.cards).values(
      starter.cards.map((c, i) => ({
        deckId: deck!.id,
        front: c.front,
        back: c.back,
        example: c.example,
        note: c.note,
        sourceKey: c.key,
        position: i,
      })),
    );
    return deck!.id;
  });
  revalidatePath("/");
  redirect(`/decks/${deckId}`);
}

async function ownedDeck(userId: string, deckId: string) {
  const [deck] = await db
    .select({ id: schema.decks.id })
    .from(schema.decks)
    .where(and(eq(schema.decks.id, deckId), eq(schema.decks.userId, userId)))
    .limit(1);
  return deck ?? null;
}

/** The next free position in a deck, so added and imported cards keep their order. */
async function nextPosition(tx: Pick<typeof db, "select">, deckId: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${schema.cards.position})` })
    .from(schema.cards)
    .where(eq(schema.cards.deckId, deckId));
  return (row?.max ?? -1) + 1;
}

async function ownedCard(userId: string, cardId: string) {
  const [card] = await db
    .select({ deckId: schema.cards.deckId })
    .from(schema.cards)
    .innerJoin(schema.decks, eq(schema.decks.id, schema.cards.deckId))
    .where(and(eq(schema.cards.id, cardId), eq(schema.decks.userId, userId)))
    .limit(1);
  return card ?? null;
}

export async function renameDeck(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const deckId = String(form.get("deckId") ?? "");
  const name = cleanName(form.get("name"));
  if (!name) return { ok: false, message: `Give the deck a name, up to ${NAME_MAX} characters.` };
  if (!(await ownedDeck(userId, deckId))) return { ok: false, message: "That deck is not yours." };
  await db.update(schema.decks).set({ name }).where(eq(schema.decks.id, deckId));
  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/");
  return { ok: true, message: "Renamed." };
}

export async function deleteDeck(form: FormData): Promise<void> {
  const userId = await requireUserId();
  const deckId = String(form.get("deckId") ?? "");
  if (!(await ownedDeck(userId, deckId))) return;
  await db.delete(schema.decks).where(eq(schema.decks.id, deckId));
  revalidatePath("/");
  redirect("/");
}

function cardFields(form: FormData) {
  return {
    front: String(form.get("front") ?? "").trim(),
    back: String(form.get("back") ?? "").trim(),
    example: String(form.get("example") ?? "").trim() || null,
    note: String(form.get("note") ?? "").trim() || null,
  };
}

export async function addCard(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const deckId = String(form.get("deckId") ?? "");
  const fields = cardFields(form);
  if (!fields.front || !fields.back) return { ok: false, message: "A card needs a front and a back." };
  if (!(await ownedDeck(userId, deckId))) return { ok: false, message: "That deck is not yours." };
  const have = await cardCount(userId);
  if (have >= MAX_CARDS) return { ok: false, message: cardCapMessage(have, 1) };
  await db.insert(schema.cards).values({ deckId, ...fields, position: await nextPosition(db, deckId) });
  revalidatePath(`/decks/${deckId}`);
  return { ok: true, message: `Added “${fields.front}”.` };
}

export async function updateCard(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const cardId = String(form.get("cardId") ?? "");
  const fields = cardFields(form);
  if (!fields.front || !fields.back) return { ok: false, message: "A card needs a front and a back." };
  const card = await ownedCard(userId, cardId);
  if (!card) return { ok: false, message: "That card is not yours." };
  await db.update(schema.cards).set(fields).where(eq(schema.cards.id, cardId));
  revalidatePath(`/decks/${card.deckId}`);
  return { ok: true, message: "Saved." };
}

export async function deleteCard(form: FormData): Promise<void> {
  const userId = await requireUserId();
  const cardId = String(form.get("cardId") ?? "");
  const card = await ownedCard(userId, cardId);
  if (!card) return;
  await db.delete(schema.cards).where(eq(schema.cards.id, cardId));
  revalidatePath(`/decks/${card.deckId}`);
}

const IMPORT_MAX_BYTES = 1_000_000;
const IMPORT_MAX_CARDS = 2000;

export async function importCards(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const deckId = String(form.get("deckId") ?? "");
  if (!(await ownedDeck(userId, deckId))) return { ok: false, message: "That deck is not yours." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a CSV file first." };
  if (file.size > IMPORT_MAX_BYTES) return { ok: false, message: "That file is over 1 MB. Split it up." };
  const { cards, skipped } = cardsFromCsv(await file.text());
  if (cards.length === 0) return { ok: false, message: "No rows with both a front and a back were found." };
  if (cards.length > IMPORT_MAX_CARDS) {
    return { ok: false, message: `That is ${cards.length} cards. The limit per import is ${IMPORT_MAX_CARDS}.` };
  }
  const have = await cardCount(userId);
  if (have + cards.length > MAX_CARDS) return { ok: false, message: cardCapMessage(have, cards.length) };
  const start = await nextPosition(db, deckId);
  await db.insert(schema.cards).values(cards.map((c, i) => ({ deckId, ...c, position: start + i })));
  revalidatePath(`/decks/${deckId}`);
  const tail = skipped ? ` Skipped ${skipped} ${skipped === 1 ? "row" : "rows"} missing a side.` : "";
  return { ok: true, message: `Imported ${cards.length} ${cards.length === 1 ? "card" : "cards"}.${tail}` };
}

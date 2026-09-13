/** A small CSV reader and writer for card import and export. RFC 4180 quoting. */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export interface CardInput {
  front: string;
  back: string;
  example?: string | null;
  note?: string | null;
}

const HEADER = ["front", "back", "example", "note"] as const;

/** Rows to cards. A header row is optional; columns beyond the four are ignored. */
export function cardsFromCsv(text: string): { cards: CardInput[]; skipped: number } {
  const rows = parseCsv(text);
  const first = rows[0]?.map((f) => f.trim().toLowerCase());
  const body = first && first[0] === HEADER[0] && first[1] === HEADER[1] ? rows.slice(1) : rows;
  const cards: CardInput[] = [];
  let skipped = 0;
  for (const r of body) {
    const [front = "", back = "", example = "", note = ""] = r.map((f) => f.trim());
    if (!front || !back) {
      skipped++;
      continue;
    }
    cards.push({ front, back, example: example || null, note: note || null });
  }
  return { cards, skipped };
}

export function cardsToCsv(cards: readonly CardInput[]): string {
  return toCsv([[...HEADER], ...cards.map((c) => [c.front, c.back, c.example ?? "", c.note ?? ""])]);
}

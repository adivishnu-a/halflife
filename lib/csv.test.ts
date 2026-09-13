import { describe, expect, it } from "vitest";

import { cardsFromCsv, cardsToCsv, parseCsv, toCsv } from "./csv";

describe("csv", () => {
  it("parses quotes, escaped quotes, commas and both line endings", () => {
    const rows = parseCsv('a,"b, c","say ""hi"""\r\nd,e,f\n');
    expect(rows).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["d", "e", "f"],
    ]);
  });

  it("round-trips cards", () => {
    const cards = [
      { front: "das Haus", back: "the house", example: "Das Haus ist alt.", note: "Plural: die Häuser" },
      { front: "sagen", back: 'to say, "speak"', example: null, note: null },
    ];
    expect(cardsFromCsv(cardsToCsv(cards)).cards).toEqual(cards);
  });

  it("accepts a header-less file and skips rows missing a side", () => {
    const { cards, skipped } = cardsFromCsv("hallo,hello\nonly front\n,only back\n");
    expect(cards).toEqual([{ front: "hallo", back: "hello", example: null, note: null }]);
    expect(skipped).toBe(2);
  });

  it("writes a header", () => {
    expect(toCsv([["a"]])).toBe("a\n");
    expect(cardsToCsv([]).trim()).toBe("front,back,example,note");
  });
});

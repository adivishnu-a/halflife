import { describe, expect, it } from "vitest";

import { formatDate, formatDue, startOfDay } from "./format";

describe("formatDue in a time zone", () => {
  // Reviewed 18:56 UTC on the 13th, due a day later. At noon IST on the 14th that
  // is still "today" by the UTC calendar but "tomorrow" by Hyderabad's.
  const due = new Date("2026-09-14T18:56:00Z");
  const now = new Date("2026-09-14T06:30:00Z");

  it("uses the reader's calendar, not the server's", () => {
    expect(formatDue(due, now, "UTC")).toBe("today");
    expect(formatDue(due, now, "Asia/Kolkata")).toBe("tomorrow");
  });

  it("counts days and falls back to a date when far away", () => {
    expect(formatDue(new Date("2026-09-17T18:56:00Z"), now, "UTC")).toBe("in 3 days");
    expect(formatDue(new Date("2026-09-12T06:00:00Z"), now, "UTC")).toBe("2 days ago");
    expect(formatDue(new Date("2026-10-20T18:56:00Z"), now, "UTC")).toBe("Tue 20 Oct");
    expect(formatDue(new Date("2027-01-05T18:56:00Z"), now, "UTC")).toBe("5 Jan 2027");
  });

  it("formats the date in the zone too", () => {
    // 20:00 UTC on the 14th is already the 15th in Kolkata.
    expect(formatDate(new Date("2026-09-14T20:00:00Z"), now, "UTC")).toBe("Mon 14 Sept");
    expect(formatDate(new Date("2026-09-14T20:00:00Z"), now, "Asia/Kolkata")).toBe("Tue 15 Sept");
  });
});

describe("startOfDay in a time zone", () => {
  it("finds the zone's midnight as an instant", () => {
    const at = new Date("2026-09-14T06:30:00Z"); // noon in Kolkata, still the 13th in Los Angeles
    expect(startOfDay(at, "UTC").toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(startOfDay(at, "Asia/Kolkata").toISOString()).toBe("2026-09-13T18:30:00.000Z");
    expect(startOfDay(at, "America/Los_Angeles").toISOString()).toBe("2026-09-13T07:00:00.000Z");
  });

  it("copes with a DST change", () => {
    // Clocks in Los Angeles go back on 1 November 2026.
    expect(startOfDay(new Date("2026-11-01T20:00:00Z"), "America/Los_Angeles").toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(startOfDay(new Date("2026-11-02T20:00:00Z"), "America/Los_Angeles").toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });
});

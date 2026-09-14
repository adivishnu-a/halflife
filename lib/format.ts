/** Date and number formatting through Intl, one place. */

const numFmt = new Intl.NumberFormat("en-GB");
const pctFmt = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 });
const days1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export const formatNumber = (n: number) => numFmt.format(n);
export const formatPercent = (p: number) => pctFmt.format(p);

/*
  Day labels depend on whose midnight counts. The server runs in UTC and the
  reader may be in Hyderabad, so "today" and "tomorrow" can disagree across
  hydration. Every function below takes the reader's IANA time zone and both
  sides pass the same one; with none given, the runtime's own zone is used.
*/
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(kind: "date" | "dateYear" | "ymd", timeZone?: string): Intl.DateTimeFormat {
  const key = `${kind}|${timeZone ?? ""}`;
  let f = fmtCache.get(key);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions =
      kind === "date"
        ? { weekday: "short", day: "numeric", month: "short" }
        : kind === "dateYear"
          ? { day: "numeric", month: "short", year: "numeric" }
          : { year: "numeric", month: "2-digit", day: "2-digit" };
    f = new Intl.DateTimeFormat(kind === "ymd" ? "en-CA" : "en-GB", { ...opts, timeZone });
    fmtCache.set(key, f);
  }
  return f;
}

/** Whole days since the epoch, by the calendar of the given zone. */
function dayNumber(d: Date, timeZone?: string): number {
  if (!timeZone) return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
  const [y, m, day] = fmt("ymd", timeZone).format(d).split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, day!) / 86_400_000);
}

export function formatDate(d: Date, now = new Date(), timeZone?: string): string {
  const sameYear = fmt("ymd", timeZone).format(d).slice(0, 4) === fmt("ymd", timeZone).format(now).slice(0, 4);
  return fmt(sameYear ? "date" : "dateYear", timeZone).format(d);
}

/** "today", "tomorrow", "in 3 days", "4 days ago", or a date when far away. */
export function formatDue(due: Date, now = new Date(), timeZone?: string): string {
  const days = dayNumber(due, timeZone) - dayNumber(now, timeZone);
  if (days <= 0 && due.getTime() <= now.getTime()) return days === 0 ? "today" : days === -1 ? "yesterday" : `${-days} days ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  return formatDate(due, now, timeZone);
}

export function formatDays(days: number): string {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))} min`;
  if (days < 1) return `${Math.round(days * 24)} h`;
  if (days < 60) return `${days1.format(days)} days`;
  if (days < 365) return `${Math.round(days / 30.4)} months`;
  return `${days1.format(days / 365)} years`;
}

export const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** Date and number formatting through Intl, one place. */

const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const dateYearFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const numFmt = new Intl.NumberFormat("en-GB");
const pctFmt = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 });
const days1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export const formatNumber = (n: number) => numFmt.format(n);
export const formatPercent = (p: number) => pctFmt.format(p);

export function formatDate(d: Date, now = new Date()): string {
  return d.getFullYear() === now.getFullYear() ? dateFmt.format(d) : dateYearFmt.format(d);
}

/** "today", "tomorrow", "in 3 days", "4 days ago", or a date when far away. */
export function formatDue(due: Date, now = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
  if (days <= 0 && due.getTime() <= now.getTime()) return days === 0 ? "today" : days === -1 ? "yesterday" : `${-days} days ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  return formatDate(due, now);
}

export function formatDays(days: number): string {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))} min`;
  if (days < 1) return `${Math.round(days * 24)} h`;
  if (days < 60) return `${days1.format(days)} days`;
  if (days < 365) return `${Math.round(days / 30.4)} months`;
  return `${days1.format(days / 365)} years`;
}

export const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

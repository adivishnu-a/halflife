import { cookies } from "next/headers";

/**
 * The reader's IANA time zone, reported by the inline script in the layout
 * through a cookie. UTC until the first page has loaded, and for anything
 * that is not a zone the runtime knows.
 */
export async function getTimeZone(): Promise<string> {
  const raw = (await cookies()).get("tz")?.value ?? "";
  try {
    const value = decodeURIComponent(raw);
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

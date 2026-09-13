/**
 * Recovery code arithmetic, no database. A code is 25 characters (125 bits)
 * from a Crockford-style alphabet without I, L, O, U so it can be read aloud.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 25;

export function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i]! % 32];
    if (i % 5 === 4 && i < CODE_LENGTH - 1) out += "-";
  }
  return out;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

export function codesMatch(hash: string, candidate: string): boolean {
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(hashCode(candidate), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

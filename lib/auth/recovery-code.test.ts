import { describe, expect, it } from "vitest";

import { generateCode, hashCode, normalizeCode } from "./recovery-code";

describe("recovery codes", () => {
  it("are 25 characters in five groups from a readable alphabet", () => {
    const code = generateCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
    expect(normalizeCode(code)).toHaveLength(25);
  });

  it("are unique", () => {
    const codes = new Set(Array.from({ length: 200 }, generateCode));
    expect(codes.size).toBe(200);
  });

  it("hash the same whatever the case, spacing or dashes", () => {
    const code = generateCode();
    const sloppy = ` ${code.toLowerCase().replaceAll("-", " ")} `;
    expect(hashCode(sloppy)).toBe(hashCode(code));
    expect(hashCode(code)).toHaveLength(64);
  });
});

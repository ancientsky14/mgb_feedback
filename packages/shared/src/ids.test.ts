import { describe, expect, it } from "vitest";
import { generatePublicRef, generateServicePointCode, isServicePointCode, normalizePublicRef } from "./ids";

describe("public reference codes", () => {
  it("are 12 Crockford characters in groups of four", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePublicRef()).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    }
  });

  it("do not repeat across many draws", () => {
    const seen = new Set(Array.from({ length: 5000 }, () => generatePublicRef()));
    expect(seen.size).toBe(5000);
  });

  it("map every byte value onto the alphabet", () => {
    const allBytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37) % 256);
    expect(generatePublicRef(allBytes)).toMatch(/^[0-9A-Z-]+$/);
    expect(generatePublicRef(() => new Uint8Array(12).fill(255))).toBe("ZZZZ-ZZZZ-ZZZZ");
    expect(generatePublicRef(() => new Uint8Array(12))).toBe("0000-0000-0000");
  });

  it("accept what people type", () => {
    expect(normalizePublicRef("7kq2 mx9a 0b1c")).toBe("7KQ2-MX9A-0B1C");
    expect(normalizePublicRef("7KQ2MX9AOBIC")).toBe("7KQ2-MX9A-0B1C"); // O→0, I→1
    expect(normalizePublicRef("7KQ2-MX9A-0BLC")).toBe("7KQ2-MX9A-0B1C"); // L→1
    expect(normalizePublicRef("7KQ2-MX9A-0B1")).toBeNull();
    expect(normalizePublicRef("7KQ2-MX9A-0B1U")).toBeNull(); // U is not in the alphabet
  });
});

describe("service-point codes", () => {
  it("are six unambiguous characters", () => {
    const code = generateServicePointCode();
    expect(isServicePointCode(code)).toBe(true);
    expect(isServicePointCode("ABCDEI")).toBe(false);
    expect(isServicePointCode("abcdef")).toBe(false);
    expect(isServicePointCode("ABCDE")).toBe(false);
  });
});

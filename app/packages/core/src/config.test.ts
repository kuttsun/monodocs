import { describe, expect, it } from "vitest";
import { parseSize } from "./config";

describe("parseSize", () => {
  it("parses sizes with units", () => {
    expect(parseSize("5MB", 0)).toBe(5 * 1024 * 1024);
    expect(parseSize("500KB", 0)).toBe(500 * 1024);
    expect(parseSize("1024", 0)).toBe(1024);
    expect(parseSize(2048, 0)).toBe(2048);
  });

  it("returns the fallback when undefined", () => {
    expect(parseSize(undefined, 42)).toBe(42);
  });

  it("throws on invalid or non-positive values", () => {
    expect(() => parseSize("abc", 0)).toThrow();
    expect(() => parseSize(0, 0)).toThrow();
    expect(() => parseSize(-5, 0)).toThrow();
  });
});

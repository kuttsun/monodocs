import { describe, expect, it } from "vitest";
import { stripOrderPrefix } from "./orderPrefix";

describe("stripOrderPrefix", () => {
  it("removes a numeric prefix with common separators", () => {
    expect(stripOrderPrefix("01_setup")).toBe("setup");
    expect(stripOrderPrefix("001-getting-started")).toBe("getting-started");
    expect(stripOrderPrefix("01. 概要")).toBe("概要");
    expect(stripOrderPrefix("10 advanced")).toBe("advanced");
  });

  it("keeps names without a separator after the digits", () => {
    expect(stripOrderPrefix("3dprinting")).toBe("3dprinting");
    expect(stripOrderPrefix("2020")).toBe("2020");
  });

  it("keeps names that have no numeric prefix", () => {
    expect(stripOrderPrefix("setup")).toBe("setup");
    expect(stripOrderPrefix("getting-started")).toBe("getting-started");
  });

  it("returns the original when stripping would leave an empty string", () => {
    expect(stripOrderPrefix("01_")).toBe("01_");
    expect(stripOrderPrefix("12-")).toBe("12-");
  });
});

import { describe, expect, it } from "vitest";
import { buildSite, toRoute, markdownRenderer } from "./index";

describe("@single-docs/core public API", () => {
  it("exports buildSite as a function", () => {
    expect(typeof buildSite).toBe("function");
  });

  it("exports helpers and the markdown renderer", () => {
    expect(typeof toRoute).toBe("function");
    expect(markdownRenderer.format).toBe("markdown");
  });
});

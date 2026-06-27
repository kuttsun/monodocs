import { describe, expect, it } from "vitest";
import { detectFormat } from "./detectFormat";

describe("detectFormat", () => {
  it("detects markdown extensions", () => {
    expect(detectFormat("a.md")).toBe("markdown");
    expect(detectFormat("dir/a.markdown")).toBe("markdown");
  });

  it("detects asciidoc extensions", () => {
    expect(detectFormat("a.adoc")).toBe("asciidoc");
    expect(detectFormat("a.asciidoc")).toBe("asciidoc");
    expect(detectFormat("a.asc")).toBe("asciidoc");
  });

  it("returns undefined for unknown extensions", () => {
    expect(detectFormat("a.txt")).toBeUndefined();
    expect(detectFormat("a")).toBeUndefined();
  });
});

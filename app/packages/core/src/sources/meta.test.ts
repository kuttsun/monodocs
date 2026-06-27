import { describe, expect, it } from "vitest";
import { toPageMeta } from "./meta";

describe("toPageMeta", () => {
  it("normalizes typed frontmatter values", () => {
    expect(toPageMeta({ title: "T", order: 3, hidden: true, description: "d" })).toEqual({
      title: "T",
      order: 3,
      hidden: true,
      description: "d",
    });
  });

  it("normalizes AsciiDoc attribute strings", () => {
    expect(toPageMeta({ order: "10", hidden: "true" }, "Doc Title")).toEqual({
      title: "Doc Title",
      order: 10,
      hidden: true,
    });
  });

  it("prefers explicit title over the fallback", () => {
    expect(toPageMeta({ title: "Explicit" }, "H1").title).toBe("Explicit");
  });

  it("falls back when no explicit title is given", () => {
    expect(toPageMeta({}, "H1").title).toBe("H1");
  });

  it("ignores invalid order and non-true hidden", () => {
    const meta = toPageMeta({ order: "abc", hidden: "false" });
    expect(meta.order).toBeUndefined();
    expect(meta.hidden).toBe(false);
  });
});

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
      headingTitle: "Doc Title",
      order: 10,
      hidden: true,
    });
  });

  it("keeps explicit title and heading title in separate fields", () => {
    const meta = toPageMeta({ title: "Explicit" }, "H1");
    expect(meta.title).toBe("Explicit");
    expect(meta.headingTitle).toBe("H1");
  });

  it("records the heading title without setting an explicit title", () => {
    const meta = toPageMeta({}, "H1");
    expect(meta.title).toBeUndefined();
    expect(meta.headingTitle).toBe("H1");
  });

  it("ignores invalid order and non-true hidden", () => {
    const meta = toPageMeta({ order: "abc", hidden: "false" });
    expect(meta.order).toBeUndefined();
    expect(meta.hidden).toBe(false);
  });
});

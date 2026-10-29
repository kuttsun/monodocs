import type { Element, Root } from "hast";
import { describe, expect, it } from "vitest";
import { blocksOf } from "./blocks";

/** Element helper. */
const h = (
  tagName: string,
  properties: Element["properties"],
  children: Element["children"] = [],
): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});
const text = (value: string) => ({ type: "text" as const, value });
const root = (...children: Element[]): Root => ({ type: "root", children });

/** Blocks a renderer does not write today but HTML can hold, read as the spec says (7.3.3). */
describe("blocks from HTML the renderers may pass through", () => {
  it("reads a video in a list item as a block of its own, by what it plays", () => {
    const list = (src: string) => root(h("ul", {}, [h("li", {}, [h("video", { src })])]));
    const keys = (src: string) => blocksOf(list(src)).map((b) => `${b.kind} ${b.key}`);
    expect(keys("a.mp4")).toEqual(["li ", "video a.mp4"]);
    expect(keys("b.mp4")).toEqual(["li ", "video b.mp4"]);
  });

  it("reads a figcaption as a block of its own", () => {
    const figure = root(
      h("figure", {}, [
        h("img", { src: "a.png", alt: "" }),
        h("figcaption", {}, [text("Caption")]),
      ]),
    );
    expect(blocksOf(figure).map((b) => b.kind)).toEqual(["image", "title"]);
  });

  it("reads a video's source children inside text", () => {
    const page = (src: string) =>
      root(h("p", {}, [text("See "), h("video", {}, [h("source", { src })])]));
    expect(blocksOf(page("a.mp4"))[0]!.key).not.toBe(blocksOf(page("b.mp4"))[0]!.key);
  });

  it("reads an image at the top of a page as it reads one in a paragraph", () => {
    const bare = blocksOf(root(h("img", { src: "a.png", alt: "x" })));
    const wrapped = blocksOf(root(h("p", {}, [h("img", { src: "a.png", alt: "x" })])));
    expect(bare.map((b) => [b.kind, b.key])).toEqual(wrapped.map((b) => [b.kind, b.key]));
  });
});

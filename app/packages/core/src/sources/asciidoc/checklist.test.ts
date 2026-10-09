import { describe, expect, it } from "vitest";
import { fromHtml } from "hast-util-from-html";
import { visit } from "unist-util-visit";
import type { Element } from "hast";
import { asciidocRenderer } from "./renderer";
import { markdownRenderer } from "../markdown/renderer";
import type { RenderContext, SourceFile } from "../../types";

function source(raw: string, format: "asciidoc" | "markdown"): SourceFile {
  const relativePath = format === "asciidoc" ? "t.adoc" : "t.md";
  return { absolutePath: `/x/${relativePath}`, relativePath, raw, format };
}

function ctx(format: "asciidoc" | "markdown"): RenderContext {
  const relativePath = format === "asciidoc" ? "t.adoc" : "t.md";
  return { page: { id: "p", route: "/p", relativePath, format } };
}

/** Each checkbox's attributes, in document order, as hast reads them. */
function boxes(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  visit(fromHtml(html, { fragment: true }), "element", (node: Element) => {
    if (node.tagName === "input") found.push({ ...node.properties });
  });
  return found;
}

async function renderAdoc(raw: string) {
  return asciidocRenderer.render(source(raw, "asciidoc"), ctx("asciidoc"));
}

describe("AsciiDoc checklists (v0.16)", () => {
  it("give each item the checkbox a Markdown task list item has, with no glyph", async () => {
    const adoc = await renderAdoc("* [x] done\n* [ ] todo\n");
    const md = await markdownRenderer.render(
      source("- [x] done\n- [ ] todo\n", "markdown"),
      ctx("markdown"),
    );

    expect(boxes(md.html)).toEqual([
      { type: "checkbox", checked: true, disabled: true },
      { type: "checkbox", disabled: true },
    ]);
    expect(boxes(adoc.html)).toEqual(boxes(md.html));
    expect(adoc.html).not.toMatch(/[✓❏]|&#10003;|&#10063;|data-item-complete/);
    expect(adoc.text).not.toMatch(/[✓❏]/);
  });

  it("render [%interactive] the same way, disabled", async () => {
    const adoc = await renderAdoc("[%interactive]\n* [x] done\n* [ ] todo\n");
    expect(boxes(adoc.html)).toEqual([
      { type: "checkbox", checked: true, disabled: true },
      { type: "checkbox", disabled: true },
    ]);
  });

  it("reach a checklist nested in a list, in a block, in a description, and in an a| cell", async () => {
    const adoc = await renderAdoc(
      "* outer\n** [ ] nested\n\n" +
        "NOTE: before\n\n[NOTE]\n====\n* [ ] in a note\n====\n\n" +
        "term:: description\n+\n* [x] in a description\n\n" +
        "|===\na|\n* [x] in a cell\n|===\n",
    );
    expect(boxes(adoc.html)).toEqual([
      { type: "checkbox", disabled: true },
      { type: "checkbox", disabled: true },
      { type: "checkbox", checked: true, disabled: true },
      { type: "checkbox", checked: true, disabled: true },
    ]);
    expect(adoc.html).not.toMatch(/[✓❏]|&#10003;|&#10063;/);
  });

  it("leave an item that only starts with the character as text", async () => {
    const adoc = await renderAdoc("* [x] done\n* ✓ written by hand\n");
    expect(boxes(adoc.html)).toHaveLength(1);
    expect(adoc.html).toContain("✓ written by hand");
  });

  it("leave an <input> passed through as raw HTML as written", async () => {
    const adoc = await renderAdoc('* [x] done\n* +++<input type="checkbox" name="keep">+++ raw\n');
    expect(boxes(adoc.html)).toEqual([
      { type: "checkbox", checked: true, disabled: true },
      { type: "checkbox", name: "keep" },
    ]);
  });
});

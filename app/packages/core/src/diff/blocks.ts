import { createHash } from "node:crypto";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import { isGenerated } from "../pipeline/generatedNumbers.js";
import { recordedData } from "../pipeline/postprocess.js";

/**
 * The blocks of a page, as comparison reads them (roadmap 7.3.3).
 *
 * A block is the smallest unit a reader would point at: a paragraph, a heading, a list item, a
 * table row, a code block, a display formula, a diagram, an image, a caption, a block title.
 * Containers — lists, tables, quotations, admonitions, AsciiDoc's wrappers — are not blocks; they
 * are walked, and each block carries its chain: the element name and the classes of each container
 * around it that say what the container is. Two blocks are the same only when their kinds, their
 * chains, and what they read as agree.
 */
export type Block = {
  /** What the block is: its element, and a heading's level with it (`h2`), or `code`, `image`... */
  kind: string;
  /** The containers around it, outermost first, as `tag.class.class`. */
  chain: string;
  /** What the block reads as, which comparison holds it to. */
  key: string;
  /** The block's element in the page's tree. */
  node: Element;
  /** The containers around it, outermost first, for writing a deleted block where it stood. */
  ancestors: Element[];
};

/**
 * The classes that say what a container is, and so go into a chain. Every other class — a role the
 * author set, the classes that only set how a container looks (a table's `frame-*`, `grid-*`,
 * `stripes-*`, `stretch`, `fit-content`), and the ones a renderer adds to say what a container holds
 * (GFM's `contains-task-list`, AsciiDoc's `checklist`) — is left out, so changing it changes no
 * block, and turning one item of a list into a task changes that item alone.
 */
const STRUCTURAL = new Set([
  // AsciiDoc's block wrappers.
  "paragraph",
  "ulist",
  "olist",
  "dlist",
  "qlist",
  "hdlist",
  "colist",
  "exampleblock",
  "sidebarblock",
  "quoteblock",
  "verseblock",
  "openblock",
  "listingblock",
  "literalblock",
  "imageblock",
  "videoblock",
  "audioblock",
  "stemblock",
  "tableblock",
  "content",
  "toc",
  "abstract",
  "partintro",
  // An ordered list's numbering style, which the reader reads.
  "arabic",
  "decimal",
  "loweralpha",
  "upperalpha",
  "lowerroman",
  "upperroman",
  "lowergreek",
  // Admonitions, as monodocs writes them for both renderers, and their kinds.
  "admonition",
  "admonition-note",
  "admonition-tip",
  "admonition-important",
  "admonition-caution",
  "admonition-warning",
  "admonition-content",
  // Footnotes, both renderers'.
  "footnotes",
]);

/** A section and the wrapper of its body, which the reader reads through the headings. */
const SECTION_WRAPPER = /^(?:sect[0-6]|sectionbody)$/;

/** Elements that hold blocks, and are walked. */
const CONTAINER_TAGS = new Set([
  "div",
  "section",
  "article",
  "aside",
  "main",
  "nav",
  "header",
  "footer",
  "blockquote",
  "ul",
  "ol",
  "dl",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "details",
  "figure",
]);

/** Elements that are blocks of their own, read as text. */
const TEXT_BLOCK = /^(?:p|h[1-6]|li|dt|dd|caption|figcaption|summary|hr)$/;

/** Elements that make an element a container when they are among its children. */
const BLOCK_LEVEL = new Set([
  ...CONTAINER_TAGS,
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "hr",
  "li",
  "dt",
  "dd",
  "tr",
  "caption",
  "figcaption",
  "summary",
]);

/** A video, an audio clip, an embedded player: blocks compared by their `src`. */
const MEDIA = new Set(["video", "audio", "iframe"]);

/** Containers whatever they hold: lists and tables, whose items and rows are the blocks. */
const STRUCTURE = new Set(["ul", "ol", "dl", "table", "thead", "tbody", "tfoot"]);

/** Parts of a container that are not blocks: a table's column layout. */
const LAYOUT = new Set(["colgroup", "col"]);

function classes(node: Element): string[] {
  const value = node.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}

function has(node: Element, name: string): boolean {
  return classes(node).includes(name);
}

function elements(node: Element): Element[] {
  return node.children.filter((child): child is Element => child.type === "element");
}

/**
 * Whether an element inside a container stands as a block rather than inline: a display formula,
 * a diagram, media, a title. An image is not one here: an element whose content is an image alone
 * is read as that image ({@link soleImage}), and an image among text is part of the text.
 */
function isBlockElement(node: Element): boolean {
  return (
    has(node, "math-display") ||
    has(node, "mermaid") ||
    has(node, "title") ||
    MEDIA.has(node.tagName) ||
    LAYOUT.has(node.tagName)
  );
}

/** Blocks read as their own kind whatever they hold. */
const OWN_KIND = new Set(["li", "dd", "dt", "tr", "td", "th"]);

/** An image an element holds alone. */
const IMAGE_TAGS = new Set(["img", "object", "svg"]);

/**
 * The image `node` is, or holds alone — through a link or a wrapper that holds nothing else — or
 * undefined. Such an image is a block of its own; one that stands among text is part of the text,
 * so a cell or a paragraph with an icon beside its words is still compared by its words.
 */
function soleImage(node: Element): Element | undefined {
  if (IMAGE_TAGS.has(node.tagName)) return node;
  // Only a wrapper that says nothing of its own is passed through: anything else — a quotation, an
  // example, a heading, a list item — is what it is, with the image its content.
  if (!isWrapper(node)) return undefined;
  const sole = only(node);
  return sole === undefined ? undefined : soleImage(sole);
}

/** The elements an image is read through: a paragraph, a link, a span, a figure's content. */
function isWrapper(node: Element): boolean {
  if (["p", "a", "span", "picture"].includes(node.tagName)) return true;
  return node.tagName === "div" && classes(node).every((name) => name === "content");
}

/** Whether `node` holds blocks of its own. */
function holdsBlocks(node: Element): boolean {
  return elements(node).some((child) => BLOCK_LEVEL.has(child.tagName) || isBlockElement(child));
}

/** A container as a chain shows it: its element and the classes that say what it is. */
function link(node: Element): string {
  const own = classes(node)
    .filter((name) => STRUCTURAL.has(name))
    .sort();
  return [node.tagName, ...own].join(".");
}

/** Whitespace runs collapsed, as a reader sees the text. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * What text reads as: generated numbers left out, an inline formula as its TeX, an inline image as
 * its hash and `alt`, a checkbox as its state. Links, emphasis, and classes are not read: a link
 * re-pointed with the same text is not a change to what the document says.
 */
function textOf(nodes: readonly ElementContent[]): string {
  let out = "";
  const walk = (list: readonly ElementContent[]) => {
    for (const child of list) {
      if (child.type === "text") {
        if (!isGenerated(child)) out += child.value;
        continue;
      }
      if (child.type !== "element") continue;
      // The numbers `numbering.sections` writes are elements of their own (19.1).
      if (child.properties.dataMonodocsSectionNumber !== undefined) continue;
      // By class and attribute: the mark `isMath` reads does not survive the renderer's HTML.
      if (has(child, "math") && typeof child.properties.dataMathTex === "string") {
        out += ` \\(${child.properties.dataMathTex}\\) `;
        continue;
      }
      if (child.tagName === "img") {
        out += ` [image ${imageKey(child)}] `;
        continue;
      }
      if (child.tagName === "input" && child.properties.type === "checkbox") {
        out +=
          child.properties.checked === true || child.properties.checked === "" ? "[x] " : "[ ] ";
        continue;
      }
      // An SVG written into the text — Asciidoctor's `opts=inline` — read as its markup.
      if (child.tagName === "svg") {
        out += ` [svg ${svgKey(child)}] `;
        continue;
      }
      // A line break reads as the space between the words it separates.
      if (child.tagName === "br") {
        out += " ";
        continue;
      }
      if (MEDIA.has(child.tagName)) {
        out += ` [${child.tagName} ${mediaKey(child)}] `;
        continue;
      }
      if (child.tagName === "object") {
        out += ` [image ${imageKey(child)}] `;
        continue;
      }
      walk(child.children);
    }
  };
  walk(nodes);
  return collapse(out);
}

/** An image as comparison reads it: its bytes' hash, or its `src` where the build read none. */
function imageKey(node: Element): string {
  const recorded = recordedData(node).monodocsImage;
  const what =
    recorded === undefined
      ? `src:${String(node.properties.src ?? node.properties.data ?? "")}`
      : "hash" in recorded
        ? `hash:${recorded.hash}`
        : `src:${recorded.src}`;
  return `${what} alt:${String(node.properties.alt ?? "")}`;
}

/**
 * The page's ID prefix, which every element ID on it carries (`{page}-`, sources/prefixIds.ts), set
 * while {@link blocksOf} reads a page. Element IDs and their prefixes are not compared (7.3.3), and a
 * page that moved has another.
 */
let pagePrefix = "";

/**
 * An SVG written into the page, as the hash of its markup without the page's ID prefix: each
 * version's own file, the same wherever the page now is.
 */
function svgKey(node: Element): string {
  let markup = toHtml(node);
  if (pagePrefix !== "") {
    const prefix = pagePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    markup = markup.replace(new RegExp(`(id="|#)${prefix}`, "g"), "$1");
  }
  return createHash("sha256").update(markup).digest("hex");
}

/** A video, an audio clip, or a player as what it plays: its `src`, and its `<source>` children's. */
function mediaKey(node: Element): string {
  return [node, ...elements(node).filter((c) => c.tagName === "source")]
    .map((element) => element.properties.src)
    .filter((src) => typeof src === "string" && src !== "")
    .join(" ");
}

/** The significant children of `node`: elements, and text that is not only whitespace. */
function significant(node: Element): ElementContent[] {
  return node.children.filter(
    (child) => child.type === "element" || (child.type === "text" && child.value.trim() !== ""),
  );
}

/** The single element `node` holds, when it holds nothing else of note. */
function only(node: Element): Element | undefined {
  const children = significant(node);
  return children.length === 1 && children[0]!.type === "element" ? children[0] : undefined;
}

/** The blocks of a page's tree, in reading order. `pageId` is the page's, whose prefix its IDs carry. */
export function blocksOf(tree: HastRoot, pageId = ""): Block[] {
  pagePrefix = pageId === "" ? "" : `${pageId}-`;
  const blocks: Block[] = [];
  const add = (kind: string, key: string, node: Element, ancestors: Element[]) => {
    blocks.push({
      kind,
      key,
      node,
      ancestors,
      chain: ancestors
        .filter((a) => !classes(a).some((c) => SECTION_WRAPPER.test(c)))
        .map(link)
        .join(" > "),
    });
  };

  /**
   * Text and inline elements between blocks: one block of text, in the chain of what holds them —
   * or, when they are an image alone (beside a figcaption, a title), that image.
   */
  const readRun = (run: ElementContent[], holder: Element, inside: Element[]) => {
    const items = run.filter((c) => c.type === "element" || c.value.trim() !== "");
    const image =
      items.length === 1 && items[0]!.type === "element" ? soleImage(items[0]!) : undefined;
    if (image !== undefined) return visit(image, inside);
    const text = textOf(run);
    if (text !== "") add("text", text, holder, inside);
  };

  const visit = (node: Element, ancestors: Element[]): void => {
    const tag = node.tagName;
    if (LAYOUT.has(tag)) return;
    // A diagram, pre-rendered or drawn in the browser, compared by its source.
    if (has(node, "mermaid")) {
      const source = recordedData(node).monodocsSource;
      return add("diagram", source?.source ?? textOf(node.children), node, ancestors);
    }
    if (tag === "pre") {
      const source = recordedData(node).monodocsSource;
      const key =
        source === undefined
          ? `text:${textOf(node.children)}`
          : `${source.kind === "mermaid" ? "mermaid" : `lang:${source.lang ?? ""}`}\n${source.source}`;
      return add("code", key, node, ancestors);
    }
    // A display formula, compared by its TeX.
    if (has(node, "math-display") && typeof node.properties.dataMathTex === "string") {
      return add("formula", collapse(node.properties.dataMathTex), node, ancestors);
    }
    if (tag === "img" || tag === "object") return add("image", imageKey(node), node, ancestors);
    if (tag === "svg") return add("image", `svg:${svgKey(node)}`, node, ancestors);
    // A video, an audio clip, or an embedded player, compared by what it plays.
    if (MEDIA.has(tag)) return add(tag, mediaKey(node), node, ancestors);
    // A paragraph that holds a display formula or an image alone is that block.
    // An element that holds an image alone — a paragraph, a link around it, a figure's content — is
    // that image, so wrapping it in a link changes nothing, as a link is not read anywhere.
    // A list item, a description, and a row are read as what they are, an image their content.
    if (!IMAGE_TAGS.has(tag) && !OWN_KIND.has(tag)) {
      const image = soleImage(node);
      if (image !== undefined) return visit(image, ancestors);
    }
    if (tag === "p") {
      const sole = only(node);
      if (sole !== undefined && has(sole, "math-display")) return visit(sole, [...ancestors, node]);
    }
    // A block's title: AsciiDoc's `div.title`, a table's caption. Admonition titles are the
    // theme's word for the kind, which the chain already carries.
    if (has(node, "admonition-title")) return;
    if (has(node, "title") || tag === "caption" || tag === "figcaption") {
      return add("title", textOf(node.children), node, ancestors);
    }
    if (tag === "tr") {
      // Each cell's text, kind, and span: a merged cell decides which column a value applies to.
      const cells = elements(node)
        .filter((cell) => cell.tagName === "td" || cell.tagName === "th")
        .map(
          (cell) =>
            `${cell.tagName}[${String(cell.properties.colSpan ?? 1)}x${String(cell.properties.rowSpan ?? 1)}] ${cellKey(cell)}`,
        );
      // As a list whose boundaries no cell's text can imitate.
      return add("tr", JSON.stringify(cells), node, ancestors);
    }
    if (tag === "li" || tag === "dd") {
      // An item's own text, the same whether it is wrapped in a paragraph or not, without the lists
      // or blocks nested in it, which are blocks of their own inside it.
      const children = significant(node);
      const leading =
        children[0]?.type === "element" && children[0].tagName === "p" ? children[0] : undefined;
      const own: ElementContent[] = [];
      const nested: Element[] = [];
      for (const child of node.children) {
        if (child === leading) own.push(...child.children);
        else if (
          child.type === "element" &&
          (BLOCK_LEVEL.has(child.tagName) || isBlockElement(child))
        ) {
          nested.push(child);
        } else own.push(child);
      }
      add(tag, textOf(own), node, ancestors);
      for (const child of nested) visit(child, [...ancestors, node]);
      return;
    }
    if (TEXT_BLOCK.test(tag)) {
      return add(tag, tag === "hr" ? "" : textOf(node.children), node, ancestors);
    }
    // A list or a table is a container whatever it holds; any other element only when it holds
    // blocks. One holding only text and inline elements — AsciiDoc's one-line admonition, its
    // footnote — is a block, so emphasis added inside it changes nothing.
    if (STRUCTURE.has(tag) || holdsBlocks(node)) {
      const inside = [...ancestors, node];
      // Text and inline elements between blocks read as one block, in the container's chain.
      let run: ElementContent[] = [];
      const flush = () => {
        readRun(run, node, inside);
        run = [];
      };
      for (const child of node.children) {
        if (child.type === "element" && (BLOCK_LEVEL.has(child.tagName) || isBlockElement(child))) {
          flush();
          visit(child, inside);
        } else if (child.type === "element" || child.type === "text") run.push(child);
      }
      flush();
      return;
    }
    // Anything else that holds only text and inline elements reads as text in it, as text beside
    // blocks in the same element does: giving it a title or another block changes nothing else.
    const text = textOf(node.children);
    if (text !== "") add("text", text, node, [...ancestors, node]);
  };

  // The tree's own text and inline elements — a table cell's, read on its own — read as a
  // container's do; a synthetic node stands for the run.
  let run: ElementContent[] = [];
  const flush = () => {
    readRun(run, { type: "element", tagName: "span", properties: {}, children: run }, []);
    run = [];
  };
  for (const child of tree.children) {
    if (child.type === "element" && (BLOCK_LEVEL.has(child.tagName) || isBlockElement(child))) {
      flush();
      visit(child, []);
    } else if (child.type === "element" || child.type === "text") run.push(child);
  }
  flush();
  return blocks;
}

/**
 * What a table cell reads as: its text, or, for a cell that holds blocks (AsciiDoc's `a|`), each of
 * them as it is compared — a diagram by its source, code with its language.
 */
function cellKey(cell: Element): string {
  if (!holdsBlocks(cell)) return textOf(cell.children);
  // Read with the page's prefix, which blocksOf sets again as it is.
  const inner = blocksOf({ type: "root", children: cell.children }, pagePrefix.replace(/-$/, ""));
  // Each with its kind and chain, so a nested list made flat inside a cell is a change.
  return JSON.stringify(inner.map((block) => [block.kind, block.chain, block.key]));
}

/** Whether two blocks are the same block: kind, chain, and what they read as. */
export function sameBlock(a: Block, b: Block): boolean {
  return a.kind === b.kind && a.chain === b.chain && a.key === b.key;
}

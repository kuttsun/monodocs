import type { Element, ElementContent, Properties, Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import { MonodocsError } from "../diagnostics.js";
import { t } from "../messages.js";
import { isGenerated } from "../pipeline/generatedNumbers.js";
import { isExternalSrc } from "../pipeline/postprocess.js";
import { containerLink, isSectionWrapper, type Block } from "./blocks.js";
import type { BlockEdit, PageComparison } from "./compare.js";

/**
 * Writing the difference into a page's tree (roadmap 7.3.4).
 *
 * The new version's tree is the frame. An added block keeps its element and gains its mark: the
 * attribute `data-monodocs-diff-block="ins"`, and its content wrapped in `<ins data-monodocs-diff>`.
 * A deleted block is cloned from the earlier tree, marked the same way with `del`, and written where
 * it stood relative to its unchanged neighbours, inside the containers it had: each container of the
 * earlier tree is paired with the new one an unchanged block inside it is in, and a container with
 * no pair is cloned around the deleted blocks it held.
 *
 * Deleted content has no address: a clone keeps no ID, no link, no attribute naming an ID, and no
 * generated number. Inside an SVG, whose references need them, every ID and every reference to it
 * is renamed with a prefix only the earlier version's clones use.
 */

/** What a block's mark is written with: an addition or a deletion. */
type Mark = "ins" | "del";

type Parent = Element | HastRoot;
/** A node in a page's tree: a page is a fragment, so its root holds what an element may. */
type Node = ElementContent;

/** The attribute every `<ins>` and `<del>` monodocs writes carries. */
const DIFF = "dataMonodocsDiff";
/** The attribute an added or deleted block carries. */
const DIFF_BLOCK = "dataMonodocsDiffBlock";

/** Elements marked by wrapping the element itself: they hold no content to wrap. */
const WRAP_WHOLE = new Set([
  "img",
  "hr",
  "svg",
  "object",
  "video",
  "audio",
  "iframe",
  "input",
  "embed",
]);

/** Elements a parent holds at most one of, which a deleted one joins rather than repeats. */
const ONE_OF = new Set(["caption", "figcaption", "summary", "thead", "tfoot"]);

/** Parts of a container that are not blocks, kept when the container is cloned around deletions. */
function isFixedPart(node: Element): boolean {
  return node.tagName === "colgroup" || classes(node).includes("admonition-title");
}

/**
 * Attributes that name IDs. Outside an SVG a clone has no IDs, so they would name the new
 * version's elements; inside one they are renamed with the IDs.
 */
const ID_REFERENCES = [
  "htmlFor",
  "headers",
  "list",
  "form",
  "itemRef",
  "popoverTarget",
  "ariaLabelledBy",
  "ariaDescribedBy",
  "ariaControls",
  "ariaOwns",
  "ariaActiveDescendant",
  "ariaDetails",
  "ariaErrorMessage",
  "ariaFlowTo",
] as const;

function classes(node: Element): string[] {
  const value = node.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}

/** A parent's children: a page's root holds what an element may. */
function kids(node: Parent): ElementContent[] {
  return node.children as ElementContent[];
}

function elements(node: Parent): Element[] {
  return kids(node).filter((child): child is Element => child.type === "element");
}

/** An `<ins>` or `<del>` monodocs writes, carrying the block's mark when it stands for the block. */
function wrapper(mark: Mark, children: ElementContent[], block = false): Element {
  const properties: Properties = { [DIFF]: "" };
  if (block) properties[DIFF_BLOCK] = mark;
  return { type: "element", tagName: mark, properties, children };
}

/**
 * Whether a node is worth a mark: an element, a pre-rendered diagram's markup, or text that is not
 * only whitespace.
 */
function significant(node: Node): boolean {
  if ((node as { type: string }).type === "raw") return true;
  return node.type === "element" || (node.type === "text" && node.value.trim() !== "");
}

/** Each node's parent in a tree, kept up to date as the tree is written. */
class Parents {
  private readonly map = new Map<Node, Parent>();

  constructor(tree: HastRoot) {
    this.index(tree);
  }

  index(parent: Parent): void {
    for (const child of kids(parent)) {
      this.map.set(child, parent);
      if (child.type === "element") this.index(child);
    }
  }

  get(node: Node): Parent | undefined {
    return this.map.get(node);
  }

  set(node: Node, parent: Parent): void {
    this.map.set(node, parent);
  }

  /** The containers around `node`, innermost first. */
  chain(node: Node): Element[] {
    const out: Element[] = [];
    for (let at = this.map.get(node); at !== undefined && at.type === "element";) {
      out.push(at);
      at = this.map.get(at);
    }
    return out;
  }

  /** The child of `ancestor` that holds `node`, or undefined when `node` is not inside it. */
  childOf(ancestor: Parent, node: Node): Node | undefined {
    let at: Node = node;
    for (let parent = this.map.get(at); parent !== undefined; parent = this.map.get(at)) {
      if (parent === ancestor) return at;
      if (parent.type === "root") return undefined;
      at = parent;
    }
    return undefined;
  }

  /** Put `nodes` in `parent`'s children at `at`, replacing `remove` of them. */
  splice(parent: Parent, at: number, remove: number, ...nodes: ElementContent[]): void {
    kids(parent).splice(at, remove, ...nodes);
    for (const node of nodes) this.set(node, parent);
  }
}

/** The first node of a block in its tree: its element, or the first node of its run. */
function firstNode(block: Block): Node {
  return block.run?.[0] ?? block.node;
}

/** Every block's element and the containers around it: what a block's own content is not. */
function structure(blocks: readonly Block[], parents: Parents): Set<Node> {
  const out = new Set<Node>();
  for (const block of blocks) {
    if (block.run === undefined) out.add(block.node);
    for (const container of parents.chain(firstNode(block))) out.add(container);
  }
  return out;
}

/**
 * Wrap a block's own content in its mark, and return what stands in its place: the block, or for
 * an element that holds no content, the wrapper around it. A row's cells are wrapped one by one,
 * since nothing but cells may stand in a row; the blocks nested in a list item are left out, being
 * blocks of their own.
 */
function markBlock(node: Element, mark: Mark, nested: ReadonlySet<Node>): Element {
  node.properties[DIFF_BLOCK] = mark;
  // A diagram is wrapped whole too: in the browser, Mermaid reads its source from its markup.
  if (WRAP_WHOLE.has(node.tagName) || classes(node).includes("mermaid")) {
    return wrapper(mark, [node]);
  }
  if (node.tagName === "tr") {
    for (const cell of elements(node)) {
      if (cell.children.some(significant)) cell.children = [wrapper(mark, cell.children)];
    }
    return node;
  }
  const out: ElementContent[] = [];
  let run: ElementContent[] = [];
  const flush = () => {
    if (run.some(significant)) out.push(wrapper(mark, run));
    else out.push(...run);
    run = [];
  };
  for (const child of node.children) {
    if (nested.has(child)) {
      flush();
      out.push(child);
    } else run.push(child);
  }
  flush();
  node.children = out;
  return node;
}

/**
 * A link inside an SVG points into the earlier version, as any other does — a page's route is a
 * `#/…` too — and is not kept; one to an element of the same SVG is a reference, and stays.
 */
function unlinkSvg(svg: Element): void {
  const ids = new Set<string>();
  const collect = (node: Element) => {
    if (typeof node.properties.id === "string") ids.add(node.properties.id);
    for (const child of elements(node)) collect(child);
  };
  collect(svg);
  const walk = (node: Element) => {
    if (node.tagName === "a") {
      for (const key of ["href", "xLinkHref"]) {
        const value = node.properties[key];
        if (typeof value === "string" && !(value.startsWith("#") && ids.has(value.slice(1)))) {
          delete node.properties[key];
        }
      }
    }
    for (const child of elements(node)) walk(child);
  };
  walk(svg);
}

/** Rename every ID in an SVG and every reference to one inside it. */
function renameSvgIds(svg: Element, prefix: string): void {
  const ids = new Set<string>();
  const collect = (node: Element) => {
    if (typeof node.properties.id === "string" && node.properties.id !== "") {
      ids.add(node.properties.id);
    }
    for (const child of elements(node)) collect(child);
  };
  collect(svg);
  if (ids.size === 0) return;
  const escape = (id: string) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = [...ids]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join("|");
  const url = new RegExp(`url\\(\\s*(['"]?)#(${names})\\1\\s*\\)`, "g");
  const selector = new RegExp(`#(${names})(?![\\w-])`, "g");
  const rename = (id: string) => (ids.has(id) ? `${prefix}${id}` : id);
  const walk = (node: Element) => {
    for (const [key, value] of Object.entries(node.properties)) {
      if (key === "id" && typeof value === "string") node.properties.id = rename(value);
      else if ((key === "href" || key === "xLinkHref") && typeof value === "string") {
        node.properties[key] = value.startsWith("#") ? `#${rename(value.slice(1))}` : value;
      } else if ((ID_REFERENCES as readonly string[]).includes(key)) {
        node.properties[key] = Array.isArray(value)
          ? value.map((name) => rename(String(name)))
          : typeof value === "string"
            ? value.split(/\s+/).map(rename).join(" ")
            : value;
      } else if (typeof value === "string" && value.includes("url(")) {
        node.properties[key] = value.replace(
          url,
          (_, quote: string, id: string) => `url(${quote}#${prefix}${id}${quote})`,
        );
      }
    }
    for (const child of node.children) {
      if (child.type === "element") walk(child);
      else if (child.type === "text" && node.tagName === "style") {
        child.value = child.value
          .replace(url, (_, quote: string, id: string) => `url(${quote}#${prefix}${id}${quote})`)
          .replace(selector, (_, id: string) => `#${prefix}${id}`);
      }
    }
  };
  walk(svg);
}

/** The writer for one version's clones, with the prefix its SVG IDs are renamed with. */
class Cloner {
  constructor(
    private readonly svgPrefix: string,
    private readonly diagramPrefix: string | undefined,
  ) {}

  /**
   * A copy of `node` with no address: no ID, link, ID-naming attribute, or generated number, and an
   * image the earlier version kept as a file shown as its `alt` and path. Several nodes, or none,
   * may stand for one: a link is replaced by its content.
   */
  clean(node: Node, inLink = false): ElementContent[] {
    if (node.type === "text") {
      return isGenerated(node) && !inLink ? [] : [{ type: "text", value: node.value }];
    }
    if ((node as { type: string }).type === "raw") {
      const raw = node as unknown as { type: "raw"; value: string };
      const value = renameRawIds(raw.value, this.svgPrefix, this.diagramPrefix);
      return [{ ...raw, value } as unknown as ElementContent];
    }
    if (node.type !== "element") return [];
    if (node.tagName === "svg") {
      const svg = this.copy(node);
      renameSvgIds(svg, this.svgPrefix);
      unlinkSvg(svg);
      return [svg];
    }
    if (isGeneratedElement(node)) return [];
    // A cross-reference's text stays as the earlier version wrote it, its numbers with it.
    if (node.tagName === "a") return node.children.flatMap((child) => this.clean(child, true));
    // A video, an audio clip, or a player the earlier version kept as a file is shown as its path,
    // as an image is: the file is in the earlier version.
    if (MEDIA_FILES.has(node.tagName)) {
      const paths = [node, ...node.children.filter((c): c is Element => c.type === "element")]
        .map((element) => element.properties.src)
        .filter((src): src is string => typeof src === "string" && isLocal(src));
      if (paths.length > 0) return [textSpan(paths.join(" "))];
    }
    if (node.tagName === "img" || node.tagName === "object") {
      const src = String(
        (node.tagName === "img" ? node.properties.src : node.properties.data) ?? "",
      );
      if (isLocal(src)) {
        const alt = String(node.properties.alt ?? "");
        return [textSpan(alt === "" ? src : `${alt} (${src})`)];
      }
    }
    const shell = this.shell(node, this.cleanChildren(node.children, inLink));
    // Other sources of the image, and a video's poster, would be read from the new version too.
    delete shell.properties.srcSet;
    if (typeof shell.properties.poster === "string" && isLocal(shell.properties.poster)) {
      delete shell.properties.poster;
    }
    return [shell];
  }

  /**
   * Children cleaned, with what a generated number is written with: the separator after it
   * (`1. Title`, `Appendix A: Title`), and the label before it when that starts the element
   * (`Figure 1. Title`), so the earlier title reads as its words alone.
   */
  private cleanChildren(children: readonly ElementContent[], inLink: boolean): ElementContent[] {
    const out: ElementContent[] = [];
    let after = false;
    for (const child of children) {
      if (child.type === "text" && isGenerated(child) && !inLink) {
        if (out.length === 1 && out[0]!.type === "text" && /^\S+\s+$/.test(out[0]!.value)) {
          out.length = 0;
        }
        after = true;
        continue;
      }
      const cleaned = this.clean(child, inLink);
      const first = cleaned[0];
      if (after && first?.type === "text") first.value = first.value.replace(/^[.:]\s*/, "");
      if (cleaned.length > 0) after = false;
      out.push(...cleaned);
    }
    return out;
  }

  /** `node` with `children`, its attributes without an address. */
  shell(node: Element, children: ElementContent[]): Element {
    const properties: Properties = { ...node.properties };
    delete properties.id;
    delete properties.name;
    for (const key of ID_REFERENCES) delete properties[key];
    return { type: "element", tagName: node.tagName, properties, children };
  }

  /** A deep copy, attributes and all, for an SVG whose IDs are renamed rather than dropped. */
  private copy(node: Element): Element {
    return {
      type: "element",
      tagName: node.tagName,
      properties: structuredClone(node.properties),
      children: node.children.flatMap((child): ElementContent[] =>
        child.type === "element"
          ? [this.copy(child)]
          : child.type === "comment"
            ? []
            : [{ ...child }],
      ),
    };
  }
}

/** Elements that play a file of their own, which a deleted clone does not read. */
const MEDIA_FILES = new Set(["video", "audio", "iframe", "embed"]);

/** Whether `src` names a file of the version, rather than data or a URL. */
function isLocal(src: string): boolean {
  return src !== "" && !src.startsWith("data:") && !isExternalSrc(src);
}

function textSpan(text: string): Element {
  return {
    type: "element",
    tagName: "span",
    properties: {},
    children: [{ type: "text", value: text }],
  };
}

/** The start tags in a diagram's markup, and its `<style>` elements whole: never its text. */
const RAW_PARTS = /<style\b[^>]*>[\s\S]*?<\/style>|<[A-Za-z][^>]*>/g;

/** An `id` attribute in a start tag. */
const ID_ATTRIBUTE = /(\sid\s*=\s*)(["'])([^"']*)\2/g;

/** The IDs a diagram's markup gives its elements, read from its start tags alone. */
export function rawIds(markup: string): string[] {
  const ids: string[] = [];
  for (const [part] of markup.matchAll(RAW_PARTS)) {
    if (part.startsWith("<style")) continue;
    for (const match of part.matchAll(ID_ATTRIBUTE)) ids.push(match[3]!);
  }
  return ids;
}

/**
 * A pre-rendered diagram's markup with every ID that does not start with the earlier version's
 * diagram prefix renamed, and every reference to one: Mermaid gives only some of a diagram's
 * elements IDs under its own (a sequence diagram's `actor0` is not, and every sequence diagram has
 * one). Each is renamed with `prefix` and the diagram's own ID, so two deleted diagrams never share
 * one. Only start tags and `<style>` are read: a label's text is never taken for an attribute.
 */
function renameRawIds(markup: string, prefix: string, keep: string | undefined): string {
  // A link, a diagram's `click`, points into the earlier version: it is not kept, unless it is a
  // reference to an element of the diagram itself.
  const own = new Set(rawIds(markup));
  markup = markup.replace(RAW_PARTS, (part) =>
    /^<a[\s>]/.test(part)
      ? part.replace(
          /\s(?:xlink:)?href\s*=\s*(["'])([^"']*)\1/g,
          (whole: string, _q: string, value: string) =>
            value.startsWith("#") && own.has(value.slice(1)) ? whole : "",
        )
      : part,
  );
  const kept = (id: string) => keep !== undefined && id.startsWith(keep);
  const all = rawIds(markup);
  const ids = new Set(all.filter((id) => !kept(id)));
  if (ids.size === 0) return markup;
  // The diagram's own ID, its root's, which every other is renamed under.
  const root = all[0];
  const full = root === undefined ? prefix : `${prefix}${root}-`;
  const rename = (id: string) => (ids.has(id) ? `${full}${id}` : id);
  const urls = (text: string) =>
    text.replace(
      /url\((['"]?)#([^)'"]+)\1\)/g,
      (_, q: string, id: string) => `url(${q}#${rename(id)}${q})`,
    );
  return markup.replace(RAW_PARTS, (part) => {
    if (part.startsWith("<style")) {
      return urls(part).replace(/#([A-Za-z_][\w-]*)(?![\w-])/g, (whole: string, id: string) =>
        ids.has(id) ? `#${full}${id}` : whole,
      );
    }
    return urls(part)
      .replace(
        ID_ATTRIBUTE,
        (_, head: string, q: string, id: string) => `${head}${q}${rename(id)}${q}`,
      )
      .replace(
        /(\s(?:xlink:)?href\s*=\s*)(["'])#([^"']*)\2/g,
        (_, head: string, q: string, id: string) => `${head}${q}#${rename(id)}${q}`,
      )
      .replace(
        RAW_ID_REFERENCES,
        (_, head: string, q: string, names: string) =>
          `${head}${q}${names
            .split(/(\s+)/)
            .map((name) => (/\s/.test(name) ? name : rename(name)))
            .join("")}${q}`,
      );
  });
}

/**
 * Attributes in markup that name IDs — a diagram's `aria-labelledby` names its `chart-title-…` —
 * renamed with them.
 */
const RAW_ID_REFERENCES =
  /(\s(?:aria-(?:labelledby|describedby|controls|owns|details|flowto|activedescendant|errormessage)|for|headers)\s*=\s*)(["'])([^"']*)\2/g;

/**
 * The numbers the renderers generated, as elements, which a deleted block does not keep: section
 * numbers, footnote references, and their back-references.
 */
function isGeneratedElement(node: Element): boolean {
  if (node.properties.dataMonodocsSectionNumber !== undefined) return true;
  if (node.properties.dataMonodocsGenerated !== undefined) return true;
  if (node.tagName === "a" && node.properties.dataFootnoteBackref !== undefined) return true;
  if (node.tagName !== "sup") return false;
  const own = classes(node);
  if (own.includes("footnote") || own.includes("footnoteref")) return true;
  return elements(node).some(
    (child) => child.tagName === "a" && child.properties.dataFootnoteRef !== undefined,
  );
}

/** What writing a difference into a page needs besides the two trees. */
export type WriteOptions = {
  /** What the IDs inside a deleted SVG start with: a prefix no ID of the new version starts with. */
  svgIdPrefix: string;
  /**
   * What the earlier version's pre-rendered diagrams' IDs start with (7.3.2), kept as they are; or
   * undefined when an ID of the new version starts with it too, and every diagram ID is renamed.
   */
  earlierDiagramPrefix: string | undefined;
};

/**
 * Write a page's difference into the new version's tree: `edits` are its blocks aligned, the new
 * ones in `next` and the earlier ones in `old`. For a deleted page, `next` is an empty root and
 * every edit a deletion. Returns how many deleted diagrams it wrote, which a build drawing diagrams
 * in the browser needs the runtime for.
 */
export function writeDifference(
  next: HastRoot,
  old: HastRoot,
  edits: readonly BlockEdit[],
  options: WriteOptions,
): number {
  const newParents = new Parents(next);
  const oldParents = new Parents(old);
  const newStructure = structure(
    edits.flatMap((edit) => (edit.op === "delete" ? [] : [edit.new])),
    newParents,
  );
  const oldStructure = structure(
    edits.flatMap((edit) => (edit.op === "insert" ? [] : [edit.old])),
    oldParents,
  );
  const cloner = new Cloner(options.svgIdPrefix, options.earlierDiagramPrefix);

  // Each earlier container paired with the new ones the unchanged blocks inside it are in, matched
  // from the block outwards — several, where the new version split it in two. A section and a link
  // may stand on one side and not the other.
  const paired = new Map<Node, Parent[]>();
  const pair = (old: Node, node: Parent) => {
    const list = paired.get(old) ?? [];
    if (!list.includes(node)) list.push(node);
    paired.set(old, list);
  };
  const transparent = (node: Element) => isSectionWrapper(node) || node.tagName === "a";
  for (const edit of edits) {
    if (edit.op !== "equal") continue;
    if (edit.old.run === undefined && edit.new.run === undefined) {
      pair(edit.old.node, edit.new.node);
    }
    const before = oldParents.chain(firstNode(edit.old));
    const after = newParents.chain(firstNode(edit.new));
    for (let i = 0, j = 0; i < before.length && j < after.length;) {
      if (containerLink(before[i]!) === containerLink(after[j]!)) {
        pair(before[i]!, after[j]!);
        i++;
        j++;
      } else if (transparent(before[i]!)) i++;
      else if (transparent(after[j]!)) j++;
      else break;
    }
  }

  const pairedNew = new Set<Parent>([...paired.values()].flat());

  // What stands for each edit in the written tree, in order: where a deletion goes is read from it.
  const items: (Node | undefined)[] = edits.map((edit) =>
    edit.op === "delete" ? undefined : firstNode(edit.new),
  );

  // Additions first: a deleted block written into an added caption goes before its mark.
  edits.forEach((edit, i) => {
    if (edit.op !== "insert") return;
    const block = edit.new;
    if (block.run !== undefined) {
      const parent = newParents.get(block.run[0]!)!;
      const at = kids(parent).indexOf(block.run[0]!);
      const end = kids(parent).indexOf(block.run.at(-1)!);
      const run = kids(parent).slice(at, end + 1) as ElementContent[];
      const marked = wrapper("ins", run, true);
      newParents.splice(parent, at, run.length, marked);
      for (const node of run) newParents.set(node, marked);
      items[i] = marked;
      return;
    }
    const parent = newParents.get(block.node)!;
    const marked = markBlock(block.node, "ins", newStructure);
    newParents.index(block.node);
    if (marked !== block.node) {
      newParents.splice(parent, kids(parent).indexOf(block.node), 1, marked);
      newParents.set(block.node, marked);
    }
  });

  // Where to put a node written for edit `i` in `parent`: after what stands for the edits before it
  // there, or before what stands for the ones after it.
  const position = (parent: Parent, i: number, node: Element): number => {
    if (parent.type === "element" && (node.tagName === "caption" || node.tagName === "summary")) {
      return 0;
    }
    let at: number | undefined;
    for (let j = i - 1; j >= 0 && at === undefined; j--) {
      const child = items[j] === undefined ? undefined : newParents.childOf(parent, items[j]!);
      if (child !== undefined) at = kids(parent).indexOf(child) + 1;
    }
    if (at === undefined) {
      for (let j = i + 1; j < edits.length; j++) {
        const child = items[j] === undefined ? undefined : newParents.childOf(parent, items[j]!);
        if (child !== undefined) {
          at = kids(parent).indexOf(child);
          break;
        }
      }
    }
    at ??= parent.children.length;
    if (parent.type === "element" && parent.tagName === "table")
      at = inTableOrder(parent, at, node);
    return node.tagName === "tr" ? afterSpans(parent, at) : at;
  };

  // The new container an earlier one stands for at edit `i`: of those it was paired with, the one
  // holding what stands for the nearest edit before it, else after it — where the block stood among
  // its unchanged neighbours.
  const counterpart = (old: Node, i: number): Parent | undefined => {
    const candidates = paired.get(old);
    if (candidates === undefined || candidates.length < 2) return candidates?.[0];
    const holding = (j: number) =>
      items[j] === undefined
        ? undefined
        : candidates.find((candidate) => newParents.childOf(candidate, items[j]!) !== undefined);
    for (let j = i - 1; j >= 0; j--) {
      const found = holding(j);
      if (found !== undefined) return found;
    }
    for (let j = i + 1; j < edits.length; j++) {
      const found = holding(j);
      if (found !== undefined) return found;
    }
    return candidates[0];
  };

  const clones = new Map<Node, Parent>();
  // Every node written from the earlier tree, for the check that none kept an ID.
  const fromEarlier: Element[] = [];
  const written = new Set<Element>();
  const rows: Element[] = [];
  const lists = new Set<Element>();
  edits.forEach((edit, i) => {
    if (edit.op !== "delete") return;
    const block = edit.old;
    // The containers up to the nearest that has a counterpart, innermost first.
    const missing: Element[] = [];
    let target: Parent = next;
    for (let at = oldParents.get(firstNode(block)); at !== undefined && at.type === "element";) {
      const found = counterpart(at, i) ?? clones.get(at);
      if (found !== undefined) {
        target = found;
        break;
      }
      missing.push(at);
      at = oldParents.get(at);
    }
    for (const container of missing.reverse()) {
      // A link is not kept, and its content is written where it was.
      if (container.tagName === "a") continue;
      // A table has one head; a section one body, which the new version may have with nothing
      // unchanged in it to pair it by.
      const existing = ONE_OF.has(container.tagName)
        ? elements(target).find((child) => child.tagName === container.tagName)
        : classes(container).includes("sectionbody")
          ? elements(target).find(
              (child) =>
                containerLink(child) === containerLink(container) &&
                !pairedNew.has(child) &&
                !written.has(child),
            )
          : undefined;
      if (existing !== undefined) {
        clones.set(container, existing);
        target = existing;
        continue;
      }
      const fixed = elements(container)
        .filter(isFixedPart)
        .flatMap((part) => cloner.clean(part));
      const shell = cloner.shell(container, fixed);
      fromEarlier.push(shell);
      written.add(shell);
      newParents.splice(target, position(target, i, shell), 0, shell);
      newParents.index(shell);
      clones.set(container, shell);
      target = shell;
    }

    let piece: Element;
    if (block.run !== undefined) {
      piece = wrapper(
        "del",
        block.run.flatMap((node) => cloner.clean(node)),
        true,
      );
    } else {
      const own = block.node.children.filter((child) => !oldStructure.has(child));
      const [clone] = cloner.clean({ ...block.node, children: own });
      if (clone === undefined || clone.type !== "element") return;
      const tag = clone.tagName;
      const existing = ONE_OF.has(tag)
        ? elements(target).find((child) => child.tagName === tag)
        : undefined;
      if (existing !== undefined) {
        // A deleted caption joins the one its table has, before the new one's text.
        const joined = wrapper("del", clone.children, true);
        fromEarlier.push(joined);
        newParents.splice(existing, 0, 0, joined);
        newParents.index(joined);
        items[i] = joined;
        return;
      }
      clones.set(block.node, clone);
      piece = markBlock(clone, "del", new Set());
      if (clone.tagName === "tr") rows.push(clone);
      if (clone.tagName === "li" && target.type === "element" && target.tagName === "ol") {
        lists.add(target);
      }
    }
    fromEarlier.push(piece);
    newParents.splice(target, position(target, i, piece), 0, piece);
    newParents.index(piece);
    items[i] = piece;
  });

  for (const row of rows) clampSpans(row, newParents);
  for (const list of lists) numberItems(list);
  for (const node of fromEarlier) assertNoEarlierId(node, options);
  return edits.filter((edit) => edit.op === "delete" && edit.old.kind === "diagram").length;
}

/** Where each part of a table stands among the others: its caption, columns, head, body, foot. */
const TABLE_ORDER: Record<string, number> = {
  caption: 0,
  colgroup: 1,
  thead: 2,
  tbody: 3,
  tr: 3,
  tfoot: 4,
};

/** `at`, moved so that `node` stands in a table where its content model puts it. */
function inTableOrder(table: Element, at: number, node: Element): number {
  const rank = TABLE_ORDER[node.tagName];
  if (rank === undefined) return at;
  const children = kids(table);
  let after = 0;
  let before = children.length;
  children.forEach((child, i) => {
    if (child.type !== "element") return;
    const other = TABLE_ORDER[child.tagName];
    if (other === undefined) return;
    if (other < rank) after = i + 1;
    else if (other > rank && i < before) before = i;
  });
  return Math.min(Math.max(at, after), before);
}

/**
 * Where a deleted row goes in a table section, given where its neighbours put it: past every row
 * a cell above it spans, so no cell of the new version covers another row than it did.
 */
function afterSpans(section: Parent, at: number): number {
  let row = 0;
  let covered = 0;
  let k = 0;
  for (; k < section.children.length; k++) {
    if (k >= at && covered <= row) break;
    const child = section.children[k]!;
    if (child.type !== "element" || child.tagName !== "tr") continue;
    // A deleted row's own spans are clamped once every row is in; they never cover a new row.
    const deleted = child.properties[DIFF_BLOCK] === "del";
    for (const cell of deleted ? [] : elements(child)) {
      if (cell.tagName !== "td" && cell.tagName !== "th") continue;
      const span = Number(cell.properties.rowSpan ?? 1);
      covered = Math.max(covered, span === 0 ? Infinity : row + Math.max(span, 1));
    }
    row++;
  }
  return k;
}

/**
 * A deleted row's cells span no further than the deleted rows written right after it, so they never
 * cover a row of the new version.
 */
function clampSpans(row: Element, parents: Parents): void {
  const parent = parents.get(row);
  if (parent === undefined) return;
  const rows = elements(parent).filter((child) => child.tagName === "tr");
  let following = 0;
  for (const next of rows.slice(rows.indexOf(row) + 1)) {
    if (next.properties[DIFF_BLOCK] !== "del") break;
    following++;
  }
  for (const cell of elements(row)) {
    const span = Number(cell.properties.rowSpan ?? 1);
    if (span === 0 || span > following + 1) {
      if (following === 0) delete cell.properties.rowSpan;
      else cell.properties.rowSpan = following + 1;
    }
  }
}

/**
 * Give each item of the new version in an ordered list the number it has without the deleted
 * items, which take none, so no view shows a new item renumbered.
 */
function numberItems(list: Element): void {
  const items = elements(list).filter(
    (child) => child.tagName === "li" && child.properties[DIFF_BLOCK] !== "del",
  );
  const reversed = list.properties.reversed === true || list.properties.reversed === "";
  const start = list.properties.start;
  let n = start === undefined || start === null ? (reversed ? items.length : 1) : Number(start);
  for (const item of items) {
    if (item.properties.value !== undefined && item.properties.value !== null) {
      n = Number(item.properties.value);
    } else item.properties.value = String(n);
    n += reversed ? -1 : 1;
  }
}

/**
 * Fail the build when an ID of the earlier tree survived in what was written without being renamed:
 * every ID written from the earlier tree is inside an SVG and carries a prefix only it uses.
 */
export function assertNoEarlierId(node: Element, options: WriteOptions): void {
  const fail = (id: string) => {
    throw new MonodocsError("internal/unexpected", t("diff.earlierIdKept", { id }));
  };
  const id = node.properties.id;
  if (typeof id === "string" && !id.startsWith(options.svgIdPrefix)) fail(id);
  for (const child of node.children) {
    if (child.type === "element") assertNoEarlierId(child, options);
    else if ((child as { type: string }).type === "raw") {
      const raw = (child as unknown as { value: string }).value;
      for (const found of rawIds(raw)) {
        const kept =
          options.earlierDiagramPrefix !== undefined &&
          found.startsWith(options.earlierDiagramPrefix);
        if (!kept && !found.startsWith(options.svgIdPrefix)) {
          fail(found);
        }
      }
    }
  }
}

/** Every ID in the trees: their elements', and their pre-rendered diagrams'. */
export function elementIds(trees: Iterable<HastRoot>): string[] {
  const ids: string[] = [];
  const walk = (node: Parent) => {
    for (const child of kids(node)) {
      if (child.type === "element") {
        if (typeof child.properties.id === "string") ids.push(child.properties.id);
        walk(child);
      } else if ((child as { type: string }).type === "raw") {
        const raw = (child as unknown as { value: string }).value;
        ids.push(...rawIds(raw));
      }
    }
  };
  for (const tree of trees) walk(tree);
  return ids;
}

/**
 * The prefix a deleted SVG's IDs are renamed with: `earlier-`, or `earlier-2-` and on, the first
 * no ID of the new version starts with — its pages' articles' and its elements' — so the same
 * input gives the same prefix.
 */
export function earlierIdPrefix(ids: readonly string[], pageIds: Iterable<string>): string {
  const all = [...[...pageIds].map((id) => `page-${id}`), ...ids];
  for (let n = 1; ; n++) {
    const prefix = n === 1 ? "earlier-" : `earlier-${n}-`;
    if (!all.some((id) => id.startsWith(prefix))) return prefix;
  }
}

/**
 * Write the difference into every page in both versions that changed, and serialise it again into
 * the page's HTML. The page's headings, text, and anchors are the new version's, untouched (7.3.4).
 * Returns how many deleted diagrams were written.
 */
export function writeChangedPages(
  pages: readonly PageComparison[],
  trees: { next: ReadonlyMap<string, HastRoot>; old: ReadonlyMap<string, HastRoot> },
  options: WriteOptions,
): number {
  let diagrams = 0;
  for (const page of pages) {
    if (page.state !== "matched" || page.edits === undefined) continue;
    if (!page.edits.some((edit) => edit.op !== "equal")) continue;
    const next = trees.next.get(page.new.id);
    const old = trees.old.get(page.old.id);
    if (next === undefined || old === undefined) continue;
    diagrams += writeDifference(next, old, page.edits, options);
    page.new.html = toHtml(next, { allowDangerousHtml: true });
  }
  return diagrams;
}

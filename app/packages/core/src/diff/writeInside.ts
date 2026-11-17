/**
 * Writing the difference inside a changed text block (roadmap 7.3.6).
 *
 * A text plan's segments are read as ranges of the two extracted texts (diff/inside.ts), each place
 * in which is mapped to the text node, or the element, it came from. The text nodes are split at
 * the ranges' ends, so each range is a list of whole nodes; each run of them under one parent is
 * wrapped in `<ins data-monodocs-diff>` or `<del data-monodocs-diff>`. A deleted range written into
 * the new block is cloned from the old one with the inline elements around it, so deleted bold text
 * stays bold, and without an address, as a deleted block is (7.3.4); it goes before the next equal
 * token, or before the added text that replaces it.
 */
import type { Element, ElementContent, Text } from "hast";
import { isGenerated } from "../pipeline/generatedNumbers.js";
import type { Extract, Span, TextPlan } from "./inside.js";

/** A node a range is made of once the text nodes are split: a part of a text node, or an atom. */
type Leaf = Text | Element;

/** What clones the old block's nodes without an address (write.ts's `Cloner`). */
export type Clean = {
  clean(node: ElementContent): ElementContent[];
  shell(node: Element, children: ElementContent[]): Element;
};

/** A range of an extracted text, from `start` up to `end`. */
type Range = { start: number; end: number };

/**
 * The plan's changes as ranges: each added range of the new text, and each deleted range of the old
 * one with where it goes in the new text — the place of the token after it.
 */
export function rangesOf(plan: TextPlan): { ins: Range[]; del: { old: Range; at: number }[] } {
  const ins: Range[] = [];
  const del: { old: Range; at: number }[] = [];
  let o = 0;
  let n = 0;
  for (const segment of plan.segments) {
    const length = segment.text.length;
    if (segment.op === "equal") {
      o += length;
      n += length;
    } else if (segment.op === "delete") {
      del.push({ old: { start: o, end: o + length }, at: n });
      o += length;
    } else {
      ins.push({ start: n, end: n + length });
      n += length;
    }
  }
  return { ins, del };
}

/**
 * The inline elements a deletion is put outside of when its place starts or ends one: a link, which
 * it never joins where it was not, and phrasing such as bold or code, whose look the deleted text
 * carries in its clone. A paragraph is never left: an item's text stays in it.
 */
const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
]);

/** What an inline element looks like: its tag and its classes, which a theme styles it by. */
function look(node: Element): string {
  const value = node.properties.className;
  const names = Array.isArray(value) ? value.map(String).sort() : [];
  return [node.tagName, ...names].join(".");
}

/**
 * Every text node of each link in `list` that holds a generated number and whose words are all
 * `covered`: a cross-reference deleted or added whole is deleted or added with its number and the
 * spaces around it, which comparison leaves out.
 */
function linkTexts(list: readonly ElementContent[], covered: (node: Text) => boolean): Set<Text> {
  const out = new Set<Text>();
  const visit = (children: readonly ElementContent[]) => {
    for (const child of children) {
      if (child.type !== "element") continue;
      if (child.tagName !== "a") {
        visit(child.children);
        continue;
      }
      const texts: Text[] = [];
      const collect = (inner: readonly ElementContent[]) => {
        for (const node of inner) {
          if (node.type === "text") texts.push(node);
          else if (node.type === "element") collect(node.children);
        }
      };
      collect(child.children);
      const words = texts.filter((node) => !isGenerated(node) && node.value.trim() !== "");
      if (texts.some(isGenerated) && words.length > 0 && words.every(covered)) {
        for (const node of texts) out.add(node);
      }
    }
  };
  visit(list);
  return out;
}

function significant(node: ElementContent): boolean {
  return node.type === "element" || (node.type === "text" && node.value.trim() !== "");
}

/** The text nodes inside `root` split where an extract's ranges end, and the parts read back. */
class Split {
  private readonly parts = new Map<Text, { start: number; node: Text }[]>();
  private readonly parents = new Map<ElementContent, Element>();

  constructor(
    private readonly root: Element,
    private readonly extract: Extract,
  ) {}

  /** Split the text nodes before each of `before` and after each of `after`, places in the text. */
  cut(before: readonly number[], after: readonly number[]): void {
    const cuts = new Map<Text, Set<number>>();
    const add = (span: Span, at: number) => {
      const set = cuts.get(span.node) ?? new Set<number>();
      set.add(at);
      cuts.set(span.node, set);
    };
    for (const p of before) {
      const origin = this.extract.origin[p];
      if (origin === undefined) continue;
      if ("node" in origin) add(origin, origin.start);
      else if ("space" in origin) add(origin.space[0]!, origin.space[0]!.start);
    }
    for (const p of after) {
      const origin = this.extract.origin[p];
      if (origin === undefined) continue;
      if ("node" in origin) add(origin, origin.end);
      else if ("space" in origin) add(origin.space.at(-1)!, origin.space.at(-1)!.end);
    }
    // Every text node the extract reads is a part of itself until it is cut.
    for (const origin of this.extract.origin) {
      for (const span of "node" in origin ? [origin] : "space" in origin ? origin.space : []) {
        if (!cuts.has(span.node)) cuts.set(span.node, new Set());
      }
    }
    for (const [node, set] of cuts) {
      const points = [...set]
        .filter((at) => at > 0 && at < node.value.length)
        .sort((a, b) => a - b);
      const bounds = [0, ...points, node.value.length];
      const parts = bounds.slice(0, -1).map((start, i) => ({
        start,
        node:
          points.length === 0
            ? node
            : ({ ...node, value: node.value.slice(start, bounds[i + 1]) } satisfies Text),
      }));
      this.parts.set(node, parts);
      if (points.length > 0)
        this.replace(
          node,
          parts.map((part) => part.node),
        );
    }
    this.index();
  }

  private replace(node: Text, by: Text[]): void {
    const walk = (parent: Element): boolean => {
      const at = parent.children.indexOf(node);
      if (at !== -1) {
        parent.children.splice(at, 1, ...by);
        return true;
      }
      return parent.children.some((child) => child.type === "element" && walk(child));
    };
    walk(this.root);
  }

  /** Each node's parent inside the root, read again after the tree changed. */
  index(): void {
    this.parents.clear();
    const walk = (parent: Element) => {
      for (const child of parent.children) {
        this.parents.set(child, parent);
        if (child.type === "element") walk(child);
      }
    };
    walk(this.root);
  }

  parentOf(node: ElementContent): Element | undefined {
    return this.parents.get(node);
  }

  /** The part of a text node a span starts in. */
  private partOf(span: Span, at: number): Text {
    const parts = this.parts.get(span.node)!;
    let found = parts[0]!.node;
    for (const part of parts) if (part.start <= at) found = part.node;
    return found;
  }

  /** The leaves of the range, in order, each once. */
  leaves(range: Range): Leaf[] {
    const out: Leaf[] = [];
    const push = (leaf: Leaf) => {
      if (out.at(-1) !== leaf && !out.includes(leaf)) out.push(leaf);
    };
    for (let p = range.start; p < range.end; p++) {
      const origin = this.extract.origin[p]!;
      if ("atom" in origin) push(origin.atom);
      else if ("node" in origin) push(this.partOf(origin, origin.start));
      else for (const span of origin.space) push(this.partOf(span, span.start));
    }
    return out;
  }

  /**
   * `leaves`, in the order of the tree, with the rest of each link whose words are all among them
   * and which holds a generated number (`linkTexts`).
   */
  withNumbers(leaves: readonly Leaf[]): Leaf[] {
    const wanted = new Set<ElementContent>(leaves);
    for (const node of linkTexts(this.root.children, (text) => wanted.has(text))) wanted.add(node);
    const out: Leaf[] = [];
    const walk = (list: readonly ElementContent[]) => {
      for (const child of list) {
        if (wanted.has(child)) out.push(child as Leaf);
        else if (child.type === "element") walk(child.children);
      }
    };
    walk(this.root.children);
    return out;
  }

  /** The leaf a place in the text starts at. */
  leafAt(p: number): Leaf {
    return this.leaves({ start: p, end: p + 1 })[0]!;
  }

  /** Wrap each run of the leaves that stand side by side under one parent; the wrappers, in order. */
  wrap(leaves: readonly Leaf[], tag: "ins" | "del"): Element[] {
    const groups: Leaf[][] = [];
    for (const leaf of leaves) {
      const group = groups.at(-1);
      const last = group?.at(-1);
      const parent = this.parentOf(leaf);
      if (
        group !== undefined &&
        last !== undefined &&
        parent !== undefined &&
        this.parentOf(last) === parent &&
        parent.children.indexOf(leaf) === parent.children.indexOf(last) + 1
      ) {
        group.push(leaf);
      } else groups.push([leaf]);
    }
    const out: Element[] = [];
    for (const group of groups) {
      const parent = this.parentOf(group[0]!);
      if (parent === undefined) continue;
      const at = parent.children.indexOf(group[0]!);
      const wrapper: Element = {
        type: "element",
        tagName: tag,
        properties: { dataMonodocsDiff: "" },
        children: [...group],
      };
      parent.children.splice(at, group.length, wrapper);
      this.parents.set(wrapper, parent);
      for (const leaf of group) this.parents.set(leaf, wrapper);
      out.push(wrapper);
    }
    return out;
  }

  /**
   * Put `node` before `leaf`, or after it, outside every inline element that `leaf` starts — or
   * ends — so deleted text never lands inside a link, or a bold or code run, that begins where it
   * was.
   */
  put(node: Element, leaf: ElementContent, after: boolean): void {
    let at: ElementContent = leaf;
    for (
      let parent = this.parentOf(at);
      parent !== undefined && parent !== this.root && INLINE.has(parent.tagName);
    ) {
      const siblings = parent.children;
      const index = siblings.indexOf(at);
      const others = after ? siblings.slice(index + 1) : siblings.slice(0, index);
      // A generated number is part of what the place ends, as a reference's is.
      if (
        others.some((other) => significant(other) && !(other.type === "text" && isGenerated(other)))
      ) {
        break;
      }
      at = parent;
      parent = this.parentOf(at);
    }
    const parent = this.parentOf(at)!;
    let index = parent.children.indexOf(at) + (after ? 1 : 0);
    // After a place, past the generated numbers that end it where nothing was left.
    while (after) {
      const next = parent.children[index];
      if (next === undefined || next.type !== "text" || !isGenerated(next)) break;
      index++;
    }
    parent.children.splice(index, 0, node);
    this.parents.set(node, parent);
  }
}

/**
 * A deleted range of the old block cloned without an address: the parts of the text nodes in it, and
 * the atoms, with the inline elements around them — a link replaced by its content, and an element
 * whose look is in `around`, which the place it is written in is inside already, left out. A
 * cross-reference deleted whole keeps its generated number, as a deleted block keeps it.
 */
function cloneRange(
  own: readonly ElementContent[],
  extract: Extract,
  range: Range,
  cloner: Clean,
  /** The looks (`look`) of the inline elements the place is inside. */
  around: ReadonlySet<string>,
) {
  const covered = new Map<Text, Range[]>();
  const atoms = new Set<Element>();
  const add = (span: Span) => {
    const list = covered.get(span.node) ?? [];
    const last = list.at(-1);
    // A character outside the BMP is two units with one span: it is taken once.
    if (last !== undefined && last.start <= span.start && span.end <= last.end) return;
    if (last !== undefined && last.end === span.start) last.end = span.end;
    else list.push({ start: span.start, end: span.end });
    covered.set(span.node, list);
  };
  for (let p = range.start; p < range.end; p++) {
    const origin = extract.origin[p]!;
    if ("atom" in origin) atoms.add(origin.atom);
    else if ("node" in origin) add(origin);
    else origin.space.forEach(add);
  }
  // A word is in the range when every character of it but a space is.
  const all = (node: Text) => {
    const parts = covered.get(node) ?? [];
    for (let i = 0; i < node.value.length; i++) {
      if (node.value[i]!.trim() === "") continue;
      if (!parts.some((part) => part.start <= i && i < part.end)) return false;
    }
    return parts.length > 0;
  };
  const whole = linkTexts(own, all);
  const walk = (list: readonly ElementContent[]): ElementContent[] =>
    list.flatMap((child): ElementContent[] => {
      if (child.type === "text") {
        if (whole.has(child)) return [{ type: "text", value: child.value }];
        const parts = covered.get(child);
        if (parts === undefined) return [];
        return parts.map((part) => ({
          type: "text",
          value: child.value.slice(part.start, part.end),
        }));
      }
      if (child.type !== "element") return [];
      if (atoms.has(child)) return cloner.clean(child);
      const inner = walk(child.children);
      if (inner.length === 0) return [];
      // A link points into the earlier version: its text is kept, not the link.
      if (child.tagName === "a" || around.has(look(child))) return inner;
      return [cloner.shell(child, inner)];
    });
  return walk(own);
}

/**
 * Write a text plan into the new block, whose own content is under `root`: the added ranges wrapped
 * in `<ins>`, and each deleted range cloned from `own`, the old block's, wrapped in `<del>` and put
 * in place. Returns the `<del>` elements written, which a column taken out of the tree detaches.
 */
export function writeNewText(
  root: Element,
  plan: TextPlan,
  own: readonly ElementContent[],
  cloner: Clean,
): Element[] {
  const { ins, del } = rangesOf(plan);
  const length = plan.new.text.length;
  const split = new Split(root, plan.new);
  split.cut(
    [...ins.map((r) => r.start), ...del.filter((d) => d.at < length).map((d) => d.at)],
    [...ins.map((r) => r.end - 1), ...(del.some((d) => d.at === length) ? [length - 1] : [])],
  );
  // The deletions' places, read before the additions are wrapped: a place an addition starts at is
  // its wrapper's.
  const places = del.map((d) => (d.at < length ? split.leafAt(d.at) : split.leafAt(length - 1)));
  const starts = new Map<number, Element>();
  for (const range of ins) {
    const wrappers = split.wrap(split.withNumbers(split.leaves(range)), "ins");
    if (wrappers[0] !== undefined) starts.set(range.start, wrappers[0]);
  }
  const written: Element[] = [];
  del.forEach((d, i) => {
    const node: Element = {
      type: "element",
      tagName: "del",
      properties: { dataMonodocsDiff: "" },
      children: [],
    };
    // Before the added text that replaces it, else the next equal word, outside what either starts.
    const start = starts.get(d.at);
    if (start !== undefined) split.put(node, start, false);
    else split.put(node, places[i]!, d.at === length);
    // The inline elements the place is inside already: the clone does not repeat them.
    const around = new Set<string>();
    for (let at = split.parentOf(node); at !== undefined && at !== root; at = split.parentOf(at)) {
      around.add(look(at));
    }
    node.children = cloneRange(own, plan.old, d.old, cloner, around);
    // Nothing kept — a deleted footnote reference — writes nothing; a deleted space is written.
    if (node.children.length === 0) {
      const parent = split.parentOf(node)!;
      parent.children.splice(parent.children.indexOf(node), 1);
    } else written.push(node);
    split.index();
  });
  return written;
}

/**
 * Wrap a text plan's deleted ranges in the old block, whose own content is under `root`: every part
 * of them but an element `kept` says the earlier column leaves out.
 */
export function writeOldText(
  root: Element,
  plan: TextPlan,
  kept: (node: Element) => boolean,
): void {
  const { del } = rangesOf(plan);
  const split = new Split(root, plan.old);
  split.cut(
    del.map((d) => d.old.start),
    del.map((d) => d.old.end - 1),
  );
  for (const d of del) {
    const leaves = split.leaves(d.old).filter((leaf) => leaf.type === "text" || kept(leaf));
    split.wrap(split.withNumbers(leaves), "del");
  }
}

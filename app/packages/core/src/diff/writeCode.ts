/**
 * Writing the difference inside a changed code block (roadmap 7.3.6): by line, whether or not the
 * block was highlighted, and not further within a line.
 *
 * The text nodes of a block are split after each line break, so every line is made of whole nodes:
 * a highlighted line its `span.line` and the line break after it, a plain one the part of the text
 * it is. An added line is wrapped in `<ins data-monodocs-diff>`, a deleted one in the earlier block
 * in `<del data-monodocs-diff>`; each run of deleted lines is cloned from the earlier block, with
 * its highlighting and without an address, into one `<del>` before the line that follows it in the
 * new block. The stylesheet shows each wrapper as a block, so a line keeps its own band.
 */
import type { Element, ElementContent, Text } from "hast";
import type { CodePlan } from "./inside.js";
import type { Clean } from "./writeInside.js";

/** A run of nodes side by side under one parent, which together are one line. */
type Group = { parent: Element; nodes: ElementContent[] };

/** A code block's nodes, each with the lines it is on, counted as `linesOf` counts them. */
class CodeLines {
  private readonly lines = new Map<ElementContent, [number, number]>();
  private readonly parents = new Map<ElementContent, Element>();

  constructor(private readonly root: Element) {
    this.split(root);
    this.index();
  }

  /** Split every text node after each line break in it. */
  private split(parent: Element): void {
    parent.children = parent.children.flatMap((child): ElementContent[] => {
      if (child.type === "element") {
        this.split(child);
        return [child];
      }
      if (child.type !== "text") return [child];
      const parts = child.value.split(/(?<=\n)/);
      if (parts.length < 2) return [child];
      return parts.map((value): Text => ({ ...child, value }));
    });
  }

  /** Read again which lines each node is on, and its parent. */
  index(): void {
    this.lines.clear();
    this.parents.clear();
    let line = 0;
    const visit = (node: ElementContent, parent: Element): [number, number] => {
      this.parents.set(node, parent);
      let range: [number, number];
      if (node.type === "text") {
        range = [line, line];
        for (const ch of node.value) if (ch === "\n") line++;
      } else if (node.type === "element" && node.tagName === "br") {
        range = [line, line];
        line++;
      } else if (node.type === "element") {
        const start = line;
        let low = Infinity;
        let high = -Infinity;
        for (const child of node.children) {
          const [a, b] = visit(child, node);
          low = Math.min(low, a);
          high = Math.max(high, b);
        }
        range = low === Infinity ? [start, start] : [low, high];
      } else range = [line, line];
      this.lines.set(node, range);
      return range;
    };
    for (const child of this.root.children) visit(child, this.root);
  }

  /** The runs of nodes that are line `k` and no other, outermost first, in order. */
  groups(k: number): Group[] {
    const out: Group[] = [];
    const visit = (parent: Element) => {
      let open: Group | undefined;
      for (const child of parent.children) {
        const [a, b] = this.lines.get(child) ?? [-1, -1];
        if (a === k && b === k) {
          if (open === undefined) {
            open = { parent, nodes: [] };
            out.push(open);
          }
          open.nodes.push(child);
          continue;
        }
        open = undefined;
        if (child.type === "element" && a <= k && k <= b) visit(child);
      }
    };
    visit(this.root);
    return out;
  }

  parentOf(node: ElementContent): Element | undefined {
    return this.parents.get(node);
  }
}

function mark(tag: "ins" | "del", children: ElementContent[]): Element {
  return { type: "element", tagName: tag, properties: { dataMonodocsDiff: "" }, children };
}

/** Wrap each run of line `k`'s nodes in a mark; the first wrapper, or undefined for an empty line. */
function wrapLine(lines: CodeLines, k: number, tag: "ins" | "del"): Element | undefined {
  let first: Element | undefined;
  for (const group of lines.groups(k)) {
    const at = group.parent.children.indexOf(group.nodes[0]!);
    const wrapper = mark(tag, group.nodes);
    group.parent.children.splice(at, group.nodes.length, wrapper);
    first ??= wrapper;
  }
  lines.index();
  return first;
}

/**
 * Write a code plan into the new block `root`: each added line wrapped in `<ins>`, and each run of
 * deleted lines cloned from the earlier block `old` into a `<del>` before the line after it. Returns
 * the `<del>` elements written, which a column taken out of the tree detaches.
 */
export function writeNewCode(
  root: Element,
  plan: CodePlan,
  old: Element,
  cloner: Clean,
): Element[] {
  const next = new CodeLines(root);
  const earlier = new CodeLines(old);
  // Where each run of deleted lines goes: before the new line after it, read before any line is
  // wrapped; or after the last line.
  type Run = { lines: number[]; before: ElementContent | undefined };
  const runs: Run[] = [];
  let run: Run | undefined;
  for (const edit of plan.edits) {
    if (edit.op === "delete") {
      if (run === undefined) {
        run = { lines: [], before: undefined };
        runs.push(run);
      }
      run.lines.push(edit.old);
      continue;
    }
    if (run !== undefined) run.before = next.groups(edit.new)[0]?.nodes[0];
    run = undefined;
  }
  const last = next
    .groups(plan.new.length - 1)
    .at(-1)
    ?.nodes.at(-1);
  // The clones are taken before anything is wrapped in the earlier block.
  const clones = runs.map((r) =>
    r.lines.flatMap((k) =>
      earlier.groups(k).flatMap((group) => group.nodes.flatMap((node) => cloner.clean(node))),
    ),
  );
  for (const edit of plan.edits) if (edit.op === "insert") wrapLine(next, edit.new, "ins");
  const written: Element[] = [];
  runs.forEach((r, i) => {
    if (clones[i]!.length === 0) return;
    const node = mark("del", clones[i]!);
    // A node now wrapped stands in its wrapper.
    const outer = (at: ElementContent) => {
      const parent = next.parentOf(at);
      return parent !== undefined &&
        parent.tagName === "ins" &&
        parent.properties.dataMonodocsDiff !== undefined
        ? parent
        : at;
    };
    const anchor = r.before ?? last;
    if (anchor === undefined) return;
    const at = outer(anchor);
    const parent = next.parentOf(at)!;
    parent.children.splice(parent.children.indexOf(at) + (r.before === undefined ? 1 : 0), 0, node);
    next.index();
    written.push(node);
  });
  return written;
}

/** Wrap each deleted line of a code plan in the earlier block `root` in `<del>`. */
export function writeOldCode(root: Element, plan: CodePlan): void {
  const lines = new CodeLines(root);
  for (const edit of plan.edits) if (edit.op === "delete") wrapLine(lines, edit.old, "del");
}

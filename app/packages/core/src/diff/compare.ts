import type { Root as HastRoot } from "hast";
import type { Page } from "../types.js";
import { blocksOf, sameBlock, type Block } from "./blocks.js";
import type { Inside } from "./inside.js";
import { diffSequences } from "./myers.js";
import { pairEdits } from "./pair.js";
import { matchPages, type PageMatch } from "./pages.js";

/**
 * One block of a matched page: kept, deleted from the earlier version, added, or changed — a
 * deleted and an added block paired, with what differs inside them (7.3.6).
 */
export type BlockEdit =
  | { op: "equal"; old: Block; new: Block }
  | { op: "delete"; old: Block }
  | { op: "insert"; new: Block }
  | { op: "change"; old: Block; new: Block; inside: Inside };

/** A page in the difference, with what changed on it when it is in both versions. */
export type PageComparison = PageMatch & {
  /** The page's blocks aligned, for a page in both versions. */
  edits?: BlockEdit[];
  /** The title the author wrote in front matter, as the earlier version had it, when it changed. */
  titleChanged?: { from: string | undefined };
  /** Whether anything on the page changed: a block, or its front-matter title. */
  changed: boolean;
};

/** A version as comparison reads it: its pages, and their trees by page ID. */
export type ComparedVersion = { pages: readonly Page[]; trees: ReadonlyMap<string, HastRoot> };

/**
 * Two pages' blocks aligned (7.3.3), and the deleted and added blocks next to each other paired
 * where what is inside them can be shown (7.3.6). Text blocks are paired; the other kinds stay
 * deleted and added until their writing comes.
 */
export function alignBlocks(before: readonly Block[], after: readonly Block[]): BlockEdit[] {
  const edits = diffSequences(before, after, sameBlock).map((edit): BlockEdit =>
    edit.op === "equal"
      ? { op: "equal", old: before[edit.old]!, new: after[edit.new]! }
      : edit.op === "delete"
        ? { op: "delete", old: before[edit.old]! }
        : { op: "insert", new: after[edit.new]! },
  );
  return pairEdits(edits, (inside) => inside.kind === "text");
}

/** The difference between two versions, page by page (roadmap 7.3.3). */
export function compareVersions(next: ComparedVersion, old: ComparedVersion): PageComparison[] {
  const blocks = (version: ComparedVersion, page: Page) => {
    const tree = version.trees.get(page.id);
    return tree === undefined ? [] : blocksOf(tree, page.id);
  };
  return matchPages(next.pages, old.pages).map((match): PageComparison => {
    if (match.state !== "matched") return { ...match, changed: true };
    const before = blocks(old, match.old);
    const after = blocks(next, match.new);
    const edits = alignBlocks(before, after);
    const titleChanged =
      match.old.explicitTitle !== match.new.explicitTitle
        ? { from: match.old.explicitTitle }
        : undefined;
    return {
      ...match,
      edits,
      ...(titleChanged === undefined ? {} : { titleChanged }),
      changed: titleChanged !== undefined || edits.some((edit) => edit.op !== "equal"),
    };
  });
}

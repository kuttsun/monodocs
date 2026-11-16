/**
 * Deleted and added blocks paired into changed blocks (roadmap 7.3.6).
 *
 * In a run of consecutive deleted and added blocks, the i-th deleted is paired with the i-th added
 * when their kinds and chains agree and what is inside them keeps half of itself. A pair is one
 * changed block, with the difference written inside it; the rest stay whole, as in stage 1. A run
 * in which nothing pairs keeps the order the edit script gave it, so stage 1's output is unchanged
 * wherever stage 3 finds nothing to pair; in a run with a pair, each slot writes its deletion before
 * its insertion.
 */
import type { BlockEdit } from "./compare.js";
import { insideDifference } from "./inside.js";

/** `edits` with the deleted and added blocks of each run paired where they can be. */
export function pairEdits(edits: readonly BlockEdit[]): BlockEdit[] {
  const out: BlockEdit[] = [];
  let i = 0;
  while (i < edits.length) {
    const edit = edits[i]!;
    if (edit.op === "equal" || edit.op === "change") {
      out.push(edit);
      i++;
      continue;
    }
    const run: BlockEdit[] = [];
    const deleted: BlockEdit[] = [];
    const added: BlockEdit[] = [];
    while (i < edits.length && (edits[i]!.op === "delete" || edits[i]!.op === "insert")) {
      run.push(edits[i]!);
      (edits[i]!.op === "delete" ? deleted : added).push(edits[i]!);
      i++;
    }
    const slots = Math.max(deleted.length, added.length);
    const pairs = Array.from({ length: slots }, (_, slot) => {
      const d = deleted[slot];
      const a = added[slot];
      if (d?.op !== "delete" || a?.op !== "insert") return undefined;
      const inside = insideDifference(d.old, a.new);
      return inside === undefined
        ? undefined
        : ({ op: "change", old: d.old, new: a.new, inside } as const);
    });
    if (pairs.every((pair) => pair === undefined)) {
      // One by one: a spread of a long run would pass more arguments than a call takes.
      for (const edit of run) out.push(edit);
      continue;
    }
    for (let slot = 0; slot < slots; slot++) {
      const pair = pairs[slot];
      if (pair !== undefined) {
        out.push(pair);
        continue;
      }
      if (deleted[slot] !== undefined) out.push(deleted[slot]!);
      if (added[slot] !== undefined) out.push(added[slot]!);
    }
  }
  return out;
}

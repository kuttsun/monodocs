/**
 * The shortest edit script between two sequences, by Myers' O(ND) algorithm (roadmap 7.3.3).
 *
 * Written here rather than taken from a package: which of two equally short scripts wins decides
 * the output bytes, so the choice belongs to what monodocs promises. A deletion is taken before an
 * insertion wherever both make a shortest script, so a replaced block shows the old one first; the
 * tests pin the output on sequences with several shortest scripts.
 *
 * The search keeps, for each number of edits d, only the 2d + 1 diagonals it reached. A page so
 * rewritten that more than {@link MAX_EDITS} edits separate its versions is not searched further:
 * after what both share at the start, the rest is read as deleted and then added, which is what such
 * a page is to its reader, and keeps the memory a build needs bounded.
 */

/** One step of an edit script: an element kept, taken from the old sequence, or added. */
export type Edit =
  | { op: "equal"; old: number; new: number }
  | { op: "delete"; old: number }
  | { op: "insert"; new: number };

/** The most edits searched for: past it, the middle is replaced whole. */
export const MAX_EDITS = 4000;

/**
 * The edits that turn `old` into `next`, in order, with each element named by its index.
 * `same` decides whether two elements are the same.
 */
export function diffSequences<A, B>(
  old: readonly A[],
  next: readonly B[],
  same: (a: A, b: B) => boolean,
  maxEdits: number = MAX_EDITS,
): Edit[] {
  // What both share at the start, which the search would take first in any case. The end is not
  // taken off: where an equally short script keeps it, the search may keep it elsewhere, and which
  // one it keeps is what the tests pin.
  let start = 0;
  while (start < old.length && start < next.length && same(old[start]!, next[start]!)) start++;
  const edits: Edit[] = [];
  for (let i = 0; i < start; i++) edits.push({ op: "equal", old: i, new: i });
  // One at a time: spread, a long script would pass more arguments than a call takes.
  for (const edit of search(start, old.length, start, next.length, old, next, same, maxEdits)) {
    edits.push(edit);
  }
  return edits;
}

/** Myers' search over `old[o0..o1)` and `next[n0..n1)`. */
function search<A, B>(
  o0: number,
  o1: number,
  n0: number,
  n1: number,
  old: readonly A[],
  next: readonly B[],
  same: (a: A, b: B) => boolean,
  maxEdits: number,
): Edit[] {
  const n = o1 - o0;
  const m = n1 - n0;
  const whole = (): Edit[] => [
    ...Array.from({ length: n }, (_, i): Edit => ({ op: "delete", old: o0 + i })),
    ...Array.from({ length: m }, (_, i): Edit => ({ op: "insert", new: n0 + i })),
  ];
  if (n === 0 || m === 0) return whole();
  const snake = (x: number, y: number) => {
    while (x < n && y < m && same(old[o0 + x]!, next[n0 + y]!)) {
      x++;
      y++;
    }
    return x;
  };

  // `trace[d][k + d]` is the furthest x reached on diagonal k after d edits.
  const trace: Int32Array[] = [];
  let previous = new Int32Array(1);
  let found = -1;
  for (let d = 0; d <= n + m; d++) {
    if (d > maxEdits) return whole();
    const current = new Int32Array(2 * d + 1);
    const at = (k: number) => previous[k + d - 1]!;
    for (let k = -d; k <= d; k += 2) {
      // Down (an insertion) from k + 1, or right (a deletion) from k - 1. On a tie the deletion is
      // taken, so it comes first in the script.
      let x: number;
      if (d === 0) x = 0;
      else {
        const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
        x = down ? at(k + 1) : at(k - 1) + 1;
      }
      x = snake(x, x - k);
      current[k + d] = x;
      if (x >= n && x - k >= m) {
        found = d;
        break;
      }
    }
    trace.push(current);
    previous = current;
    if (found >= 0) break;
  }

  // Walk back from the end, one d at a time, collecting the edits in reverse.
  const edits: Edit[] = [];
  let x = n;
  let y = m;
  for (let d = found; d >= 0; d--) {
    const k = x - y;
    if (d === 0) {
      while (x > 0 && y > 0) {
        x--;
        y--;
        edits.push({ op: "equal", old: o0 + x, new: n0 + y });
      }
      break;
    }
    const before = trace[d - 1]!;
    const at = (kk: number) => before[kk + d - 1]!;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX + (down ? 0 : 1) && y > prevY + (down ? 1 : 0)) {
      x--;
      y--;
      edits.push({ op: "equal", old: o0 + x, new: n0 + y });
    }
    if (down) {
      y--;
      edits.push({ op: "insert", new: n0 + y });
    } else {
      x--;
      edits.push({ op: "delete", old: o0 + x });
    }
  }
  return edits.reverse();
}

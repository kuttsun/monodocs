/**
 * The shortest edit script between two sequences, by Myers' O(ND) algorithm (roadmap 7.3.3).
 *
 * Written here rather than taken from a package: which of two equally short scripts wins decides
 * the output bytes, so the choice belongs to what monodocs promises. A deletion is taken before an
 * insertion wherever both make a shortest script, so a replaced block shows the old one first; the
 * tests pin the output on sequences with several shortest scripts.
 */

/** One step of an edit script: an element kept, taken from the old sequence, or added. */
export type Edit =
  | { op: "equal"; old: number; new: number }
  | { op: "delete"; old: number }
  | { op: "insert"; new: number };

/**
 * The edits that turn `old` into `next`, in order, with each element named by its index.
 * `same` decides whether two elements are the same.
 */
export function diffSequences<A, B>(
  old: readonly A[],
  next: readonly B[],
  same: (a: A, b: B) => boolean,
): Edit[] {
  const n = old.length;
  const m = next.length;
  const max = n + m;
  const offset = max;
  // `v[k + offset]` is the furthest x reached on diagonal k; one copy kept per d to backtrack.
  let v = new Array<number>(2 * max + 2).fill(0);
  const trace: number[][] = [];
  const snake = (x: number, y: number) => {
    while (x < n && y < m && same(old[x]!, next[y]!)) {
      x++;
      y++;
    }
    return x;
  };

  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    const current = v.slice();
    for (let k = -d; k <= d; k += 2) {
      // Down (an insertion) from k + 1, or right (a deletion) from k - 1. On a tie the deletion is
      // taken, so it comes first in the script.
      const down = k === -d || (k !== d && v[k - 1 + offset]! < v[k + 1 + offset]!);
      let x = down ? v[k + 1 + offset]! : v[k - 1 + offset]! + 1;
      let y = x - k;
      x = snake(x, y);
      y = x - k;
      current[k + offset] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
    v = current;
  }
  trace.push(v.slice());

  // Walk back from the end, one d at a time, collecting the edits in reverse.
  const edits: Edit[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 2; d >= 0; d--) {
    const before = trace[d]!;
    const k = x - y;
    const down = k === -d || (k !== d && before[k - 1 + offset]! < before[k + 1 + offset]!);
    const prevK = down ? k + 1 : k - 1;
    const prevX = before[prevK + offset]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.push({ op: "equal", old: x, new: y });
    }
    if (d === 0) break;
    if (down) {
      y--;
      edits.push({ op: "insert", new: y });
    } else {
      x--;
      edits.push({ op: "delete", old: x });
    }
  }
  return edits.reverse();
}

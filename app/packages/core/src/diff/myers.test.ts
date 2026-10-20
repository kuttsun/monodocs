import { describe, expect, it } from "vitest";
import { diffSequences, type Edit } from "./myers";

/** The script as a string: `=a` kept, `-a` deleted, `+a` inserted. */
function script(old: string, next: string): string {
  const a = [...old];
  const b = [...next];
  return diffSequences(a, b, (x, y) => x === y)
    .map((e: Edit) =>
      e.op === "equal" ? `=${a[e.old]}` : e.op === "delete" ? `-${a[e.old]}` : `+${b[e.new]}`,
    )
    .join(" ");
}

describe("Myers' shortest edit script", () => {
  it("keeps what is the same and edits nothing else", () => {
    expect(script("", "")).toBe("");
    expect(script("abc", "abc")).toBe("=a =b =c");
    expect(script("", "ab")).toBe("+a +b");
    expect(script("ab", "")).toBe("-a -b");
  });

  it("is the shortest script", () => {
    // Myers' own example: ABCABBA to CBABAC takes five edits.
    const edits = diffSequences([..."ABCABBA"], [..."CBABAC"], (x, y) => x === y);
    expect(edits.filter((e) => e.op !== "equal")).toHaveLength(5);
  });

  it("takes a deletion before an insertion, so a replaced element shows the old one first", () => {
    expect(script("a", "b")).toBe("-a +b");
    expect(script("xay", "xby")).toBe("=x -a +b =y");
    expect(script("ab", "ba")).toBe("-a =b +a");
  });

  it("gives the same script every time on sequences with several shortest ones", () => {
    // Pinned: these are monodocs' choices, which decide the output bytes.
    expect(script("ABCABBA", "CBABAC")).toBe("-A -B =C +B =A =B -B =A +C");
    expect(script("aab", "abb")).toBe("=a -a =b +b");
    expect(script("abab", "baba")).toBe("-a =b =a =b +a");
  });

  it("yields the new sequence, in the fewest edits, on random sequences", () => {
    // A small linear congruential generator, so the cases are the same on every run.
    let seed = 12345;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const lcs = (a: string[], b: string[]) => {
      const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          t[i]![j] =
            a[i - 1] === b[j - 1] ? t[i - 1]![j - 1]! + 1 : Math.max(t[i - 1]![j]!, t[i]![j - 1]!);
        }
      }
      return t[a.length]![b.length]!;
    };
    for (let round = 0; round < 300; round++) {
      const make = () =>
        Array.from({ length: Math.floor(random() * 9) }, () => "abc"[Math.floor(random() * 3)]!);
      const a = make();
      const b = make();
      const edits = diffSequences(a, b, (x, y) => x === y);
      const rebuilt = edits.flatMap((e) =>
        e.op === "equal" ? [a[e.old]!] : e.op === "insert" ? [b[e.new]!] : [],
      );
      expect(rebuilt).toEqual(b);
      expect(edits.filter((e) => e.op === "delete").map((e) => (e as { old: number }).old)).toEqual(
        a.map((_, i) => i).filter((i) => !edits.some((e) => e.op === "equal" && e.old === i)),
      );
      expect(edits.filter((e) => e.op !== "equal")).toHaveLength(
        a.length + b.length - 2 * lcs(a, b),
      );
    }
  });

  it("replaces the middle whole past the most edits it searches, keeping the memory bounded", () => {
    // Past the limit, after what both share at the start, the rest is deleted and then added.
    expect(diffSequences([..."xabc"], [..."xdef"], (a, b) => a === b, 2).map((e) => e.op)).toEqual([
      "equal",
      "delete",
      "delete",
      "delete",
      "insert",
      "insert",
      "insert",
    ]);
    // Six thousand blocks rewritten on each side finish without a search of every edit.
    const a = Array.from({ length: 6000 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 6000 }, (_, i) => `b${i}`);
    const edits = diffSequences(a, b, (x, y) => x === y);
    expect(edits).toHaveLength(12000);
  });
});

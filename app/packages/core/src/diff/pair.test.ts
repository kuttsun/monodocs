import type { Element, ElementContent, Root } from "hast";
import { describe, expect, it } from "vitest";
import { blocksOf, type Block } from "./blocks";
import type { BlockEdit } from "./compare";
import { pairEdits } from "./pair";

const h = (tagName: string, children: ElementContent[] = []): Element => ({
  type: "element",
  tagName,
  properties: {},
  children,
});
const t = (value: string) => ({ type: "text" as const, value });
const block = (tag: string, value: string): Block =>
  blocksOf({ type: "root", children: [h(tag, [t(value)])] } as Root, "page")[0]!;
const ops = (edits: BlockEdit[]) =>
  edits.map((e) =>
    e.op === "equal"
      ? "="
      : e.op === "delete"
        ? `-${e.old.key}`
        : e.op === "insert"
          ? `+${e.new.key}`
          : `~${e.old.key}>${e.new.key}`,
  );

describe("pairEdits", () => {
  it("pairs the i-th deleted block with the i-th added one, in a run", () => {
    const same = block("p", "kept text here");
    const edits: BlockEdit[] = [
      { op: "equal", old: same, new: same },
      { op: "delete", old: block("p", "first old words") },
      { op: "delete", old: block("p", "second old words") },
      { op: "insert", new: block("p", "first new words") },
      { op: "insert", new: block("p", "second new words") },
      { op: "equal", old: same, new: same },
    ];
    expect(ops(pairEdits(edits))).toEqual([
      "=",
      "~first old words>first new words",
      "~second old words>second new words",
      "=",
    ]);
  });

  it("keeps a run in which nothing pairs as the edit script gave it", () => {
    const edits: BlockEdit[] = [
      { op: "delete", old: block("p", "Paragraph text") },
      { op: "delete", old: block("p", "Extra deleted") },
      { op: "insert", new: block("h2", "Paragraph text") },
    ];
    expect(ops(pairEdits(edits))).toEqual(["-Paragraph text", "-Extra deleted", "+Paragraph text"]);
  });

  it("writes each slot of a run with a pair in turn, a deletion before its insertion", () => {
    const edits: BlockEdit[] = [
      { op: "delete", old: block("p", "One two three four") },
      { op: "delete", old: block("p", "Extra deleted") },
      { op: "insert", new: block("p", "One two three five") },
      { op: "insert", new: block("h2", "Extra added") },
    ];
    expect(ops(pairEdits(edits))).toEqual([
      "~One two three four>One two three five",
      "-Extra deleted",
      "+Extra added",
    ]);
  });

  it("does not pair blocks that keep less than half of themselves", () => {
    const edits: BlockEdit[] = [
      { op: "delete", old: block("p", "旧版の設定で組み、新版の見た目で出す。") },
      { op: "insert", new: block("p", "新版の設定で組み直し、旧版と比べる。") },
    ];
    expect(pairEdits(edits).map((e) => e.op)).toEqual(["delete", "insert"]);
  });

  it("takes the deleted and added blocks of a run in order, the i-th with the i-th", () => {
    const edits: BlockEdit[] = [
      { op: "insert", new: block("p", "Brand new block") },
      { op: "delete", old: block("p", "One two three four") },
      { op: "insert", new: block("p", "One two three five") },
    ];
    // In a run the deletes and inserts are taken in order: slot 0 is the deleted block and the
    // first added one, which do not pair, and slot 1 has an added block alone, so nothing pairs
    // and the run stays as the edit script gave it.
    expect(ops(pairEdits(edits))).toEqual([
      "+Brand new block",
      "-One two three four",
      "+One two three five",
    ]);
  });

  it("returns a long run in which nothing pairs without exceeding a call's arguments", () => {
    const added = block("p", "Added");
    const edits: BlockEdit[] = Array.from({ length: 150000 }, () => ({ op: "insert", new: added }));
    expect(pairEdits(edits)).toHaveLength(150000);
  });
});

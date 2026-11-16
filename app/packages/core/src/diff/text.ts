/**
 * The difference between two texts, in tokens (roadmap 7.3.6).
 *
 * The tokens of the old and the new text are aligned with the same Myers implementation and
 * tie-break the blocks use (7.3.3), so a replaced run shows the old text first. The alignment is
 * then cleaned: an equal run between two changes that is shorter than two characters, or made only
 * of whitespace and punctuation, becomes part of the change, since a one-character island in a
 * rewritten phrase reads as noise. When what is equal is less than half of the longer text, counted
 * in grapheme clusters, the texts are shown whole, as a deletion and an addition: a rewritten
 * paragraph read as confetti is harder to read than the two versions.
 */
import { graphemeClusters, inRanges } from "./graphemes.js";
import { diffSequences } from "./myers.js";
import { tokenize } from "./tokens.js";
import { PUNCTUATION_RANGES, SPACE_RANGES } from "./unicodeTables.js";

/** A run of text kept, deleted from the old text, or inserted into the new one. */
export type Segment = { op: "equal" | "delete" | "insert"; text: string };

/**
 * The texts compared: `segments` in order (a change's deletion before its insertion), or `whole`
 * when less than half of the longer text is equal.
 */
export type TextDifference = { whole: true } | { whole: false; segments: Segment[] };

/** The number of grapheme clusters in `text`. */
const clusterCount = (text: string) => graphemeClusters(text).length;

/** Whether `text` is made only of whitespace and punctuation. */
function onlySpaceAndPunctuation(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (!inRanges(SPACE_RANGES, cp) && !inRanges(PUNCTUATION_RANGES, cp)) return false;
  }
  return true;
}

/**
 * The aligned texts as runs: each change, whatever order the edit script interleaves its
 * deletions and insertions in, as its deleted text followed by its inserted text.
 */
function runsOf(oldText: string, newText: string): Segment[] {
  const old = tokenize(oldText);
  const next = tokenize(newText);
  const segments: Segment[] = [];
  let deleted = "";
  let inserted = "";
  const flush = () => {
    if (deleted !== "") segments.push({ op: "delete", text: deleted });
    if (inserted !== "") segments.push({ op: "insert", text: inserted });
    deleted = "";
    inserted = "";
  };
  for (const edit of diffSequences(old, next, (a, b) => a.text === b.text)) {
    if (edit.op === "delete") deleted += old[edit.old]!.text;
    else if (edit.op === "insert") inserted += next[edit.new]!.text;
    else {
      flush();
      const text = old[edit.old]!.text;
      const last = segments[segments.length - 1];
      if (last?.op === "equal") last.text += text;
      else segments.push({ op: "equal", text });
    }
  }
  flush();
  return segments;
}

/**
 * Absorbs an equal run between two changes into them when it is shorter than two characters or
 * only whitespace and punctuation: the run joins both the deleted and the inserted text, and the
 * two changes become one.
 */
function cleanUp(runs: Segment[]): Segment[] {
  // Each change as one deleted and one inserted text, between the equal runs.
  type Change = { deleted: string; inserted: string };
  const parts: (Segment | Change)[] = [];
  for (const run of runs) {
    const last = parts[parts.length - 1];
    if (run.op === "equal") parts.push({ ...run });
    else if (last && !("op" in last)) {
      if (run.op === "delete") last.deleted += run.text;
      else last.inserted += run.text;
    } else {
      parts.push(
        run.op === "delete"
          ? { deleted: run.text, inserted: "" }
          : { deleted: "", inserted: run.text },
      );
    }
  }
  const out: (Segment | Change)[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const before = out[out.length - 1];
    const after = parts[i + 1];
    if (
      "op" in part &&
      before !== undefined &&
      !("op" in before) &&
      after !== undefined &&
      !("op" in after) &&
      (clusterCount(part.text) < 2 || onlySpaceAndPunctuation(part.text))
    ) {
      before.deleted += part.text + after.deleted;
      before.inserted += part.text + after.inserted;
      i++;
      continue;
    }
    out.push("op" in part ? part : { ...part });
  }
  const segments: Segment[] = [];
  for (const part of out) {
    if ("op" in part) segments.push(part);
    else {
      if (part.deleted !== "") segments.push({ op: "delete", text: part.deleted });
      if (part.inserted !== "") segments.push({ op: "insert", text: part.inserted });
    }
  }
  return segments;
}

/** The difference between `oldText` and `newText`. */
export function diffText(oldText: string, newText: string): TextDifference {
  const segments = cleanUp(runsOf(oldText, newText));
  const equal = segments
    .filter((s) => s.op === "equal")
    .reduce((n, s) => n + clusterCount(s.text), 0);
  const longer = Math.max(clusterCount(oldText), clusterCount(newText));
  if (equal * 2 < longer) return { whole: true };
  return { whole: false, segments };
}

/** The difference written as `[-deleted-]{+inserted+}` around the equal text, for tests and logs. */
export function formatDifference(difference: TextDifference): string {
  if (difference.whole) return "(whole)";
  return difference.segments
    .map((s) => (s.op === "equal" ? s.text : s.op === "delete" ? `[-${s.text}-]` : `{+${s.text}+}`))
    .join("");
}

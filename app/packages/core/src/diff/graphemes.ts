/**
 * Extended grapheme clusters (UAX #29), from the generated Unicode tables (roadmap 7.3.6).
 *
 * A changed block's text is compared in tokens made of grapheme clusters, so that a combining mark,
 * an emoji joined by ZWJ, a flag's two regional indicators, or a Devanagari conjunct such as `क्ष`
 * is never split. `Intl.Segmenter` would do this, but by the ICU of the Node that runs the build:
 * the rules have changed even for characters that already existed (Unicode 15.1 added the conjunct
 * rule, GB9c), so one input would give different clusters on two Nodes. The rules below are those
 * of UAX #29 for the Unicode version the tables name, and src/diff/graphemes.test.ts runs every
 * case of that version's GraphemeBreakTest.txt.
 */
import {
  CONJUNCT_RANGES,
  GCB_VALUES,
  GRAPHEME_BREAK_RANGES,
  INCB_VALUES,
  PICTOGRAPHIC_RANGES,
} from "./unicodeTables.js";

type Gcb = (typeof GCB_VALUES)[number];
type Incb = (typeof INCB_VALUES)[number];

/** Whether `cp` lies in flattened [start, end, …] ranges, found by binary search. */
export function inRanges(ranges: readonly number[], cp: number): boolean {
  let lo = 0;
  let hi = ranges.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid * 2]!) hi = mid - 1;
    else if (cp > ranges[mid * 2 + 1]!) lo = mid + 1;
    else return true;
  }
  return false;
}

/** The code `cp` has in flattened [start, end, code, …] ranges, or 0 when it is in none. */
function codeIn(ranges: readonly number[], cp: number): number {
  let lo = 0;
  let hi = ranges.length / 3 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid * 3]!) hi = mid - 1;
    else if (cp > ranges[mid * 3 + 1]!) lo = mid + 1;
    else return ranges[mid * 3 + 2]!;
  }
  return 0;
}

/** The Grapheme_Cluster_Break value of `cp`. */
export const gcbOf = (cp: number): Gcb => GCB_VALUES[codeIn(GRAPHEME_BREAK_RANGES, cp)]!;
const incbOf = (cp: number): Incb => INCB_VALUES[codeIn(CONJUNCT_RANGES, cp)]!;

const isControl = (g: Gcb) => g === "Control" || g === "CR" || g === "LF";

/** Splits `text` into extended grapheme clusters. */
export function graphemeClusters(text: string): string[] {
  const clusters: string[] = [];
  let current = "";
  let prev: Gcb | undefined;
  // GB11: an Extended_Pictographic, then Extend*, then ZWJ, ends just before the current character.
  let emoji: "none" | "pictographic" | "zwj" = "none";
  // GB9c: an InCB Linker, then InCB Extend*, ends just before the current character.
  let linked = false;
  // GB12, GB13: how many regional indicators in a row end just before the current character.
  let regional = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const g = gcbOf(cp);
    const incb = incbOf(cp);
    const pictographic = inRanges(PICTOGRAPHIC_RANGES, cp);
    if (prev !== undefined && breaksBetween(prev, g, incb, pictographic, emoji, linked, regional)) {
      clusters.push(current);
      current = "";
    }
    current += ch;

    if (pictographic) emoji = "pictographic";
    else if (emoji === "pictographic" && g === "Extend") emoji = "pictographic";
    else if (emoji === "pictographic" && g === "ZWJ") emoji = "zwj";
    else emoji = "none";
    if (incb === "Linker") linked = true;
    else if (!(linked && incb === "Extend")) linked = false;
    regional = g === "Regional_Indicator" ? regional + 1 : 0;
    prev = g;
  }
  if (current !== "") clusters.push(current);
  return clusters;
}

/** Whether there is a break between a character of `prev` and one of `g` (GB3 to GB999). */
function breaksBetween(
  prev: Gcb,
  g: Gcb,
  incb: Incb,
  pictographic: boolean,
  emoji: "none" | "pictographic" | "zwj",
  linked: boolean,
  regional: number,
): boolean {
  if (prev === "CR" && g === "LF") return false; // GB3
  if (isControl(prev)) return true; // GB4
  if (isControl(g)) return true; // GB5
  if (prev === "L" && (g === "L" || g === "V" || g === "LV" || g === "LVT")) return false; // GB6
  if ((prev === "LV" || prev === "V") && (g === "V" || g === "T")) return false; // GB7
  if ((prev === "LVT" || prev === "T") && g === "T") return false; // GB8
  if (g === "Extend" || g === "ZWJ") return false; // GB9
  if (g === "SpacingMark") return false; // GB9a
  if (prev === "Prepend") return false; // GB9b
  if (linked && incb === "Consonant") return false; // GB9c
  if (emoji === "zwj" && pictographic) return false; // GB11
  if (prev === "Regional_Indicator" && g === "Regional_Indicator" && regional % 2 === 1) {
    return false; // GB12, GB13
  }
  return true; // GB999
}

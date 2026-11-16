// Generates src/diff/unicodeTables.ts from the vendored Unicode data files.
//
// The comparison inside a changed block (roadmap 7.3.6) splits text into grapheme clusters and
// tokens by script. Which script a character belongs to and where a cluster ends are read from
// tables generated here from one Unicode version, not from the regular-expression engine or
// `Intl.Segmenter`: both follow the Node that runs the build, so one input would split differently
// on two Nodes, and the bytes of the output with it (12.4).
//
//   node scripts/generate-diff-unicode.mjs           rewrite the table
//   node scripts/generate-diff-unicode.mjs --check   exit 1 if the table does not match the data
//
// To move to a new Unicode version, put its files in scripts/data/ under their versioned names
// (DerivedCoreProperties as the Indic_Conjunct_Break excerpt, with its source's SHA-256), point
// VERSION at it, delete the old ones, and run without --check. GraphemeBreakTest.txt is read by
// src/diff/graphemes.test.ts, which runs every case in it.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const VERSION = "18.0.0";
const data = (name) => new URL(`./data/${name}`, import.meta.url);
const TABLE_FILE = new URL("../src/diff/unicodeTables.ts", import.meta.url);

/** The Grapheme_Cluster_Break values the segmenter distinguishes, by their code in the table. */
export const GCB = [
  "Other",
  "CR",
  "LF",
  "Control",
  "Extend",
  "ZWJ",
  "Regional_Indicator",
  "Prepend",
  "SpacingMark",
  "L",
  "V",
  "T",
  "LV",
  "LVT",
];
/** The Indic_Conjunct_Break values, by their code in the table (None is absent from it). */
export const INCB = ["None", "Linker", "Consonant", "Extend"];

/**
 * Characters that are one token each, as Han characters are, though their Script is Common:
 * 〆 (IDEOGRAPHIC CLOSING MARK) and the prolonged sound marks ー and its halfwidth form ｰ, which
 * read as part of the kana around them. 々, ヵ, and ヶ are Han and Katakana already.
 */
const CJK_EXTRA = [0x3006, 0x30fc, 0xff70];
const CJK_SCRIPTS = new Set(["Han", "Hiragana", "Katakana"]);

/** Reads `<start>[..<end>] ; <value>` lines, failing on any other, with the file's own name. */
function* entries(text, name) {
  for (const line of text.split("\n")) {
    const body = line.replace(/#.*/, "").trim();
    if (!body) continue;
    const m = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([^;]+?)(?:\s*;\s*(\S+))?$/.exec(body);
    if (!m) throw new Error(`${name}: cannot read ${JSON.stringify(line)}`);
    const start = parseInt(m[1], 16);
    yield { start, end: m[2] ? parseInt(m[2], 16) : start, value: m[3], sub: m[4] };
  }
}

/** Checks a file's first line names it at VERSION, and returns its copyright line. */
function header(text, name, versionLine = new RegExp(`^# ${name}-${VERSION}\\.txt$`, "m")) {
  if (!versionLine.test(text)) throw new Error(`${name}: not version ${VERSION}`);
  const copyright = /^# (© \d{4} Unicode®, Inc\.)$/m.exec(text)?.[1];
  if (!copyright) throw new Error(`${name}: no copyright line`);
  return copyright;
}

/** Merges code points (or [start, end] pairs) into sorted, non-overlapping inclusive ranges. */
function merge(pairs) {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Merges [start, end, code] triples whose codes agree and whose ranges touch. */
function mergeCoded(triples) {
  const sorted = [...triples].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e, c] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) throw new Error(`overlapping ranges at U+${s.toString(16)}`);
    if (last && last[2] === c && s === last[1] + 1) last[1] = e;
    else out.push([s, e, c]);
  }
  return out;
}

/** Parses the data files into the tables the segmenter and the tokenizer read. */
export async function parse() {
  const read = (n) => readFile(data(n), "utf8");
  const [scripts, gc, props, gcb, emoji, incb] = await Promise.all([
    read(`Scripts-${VERSION}.txt`),
    read(`DerivedGeneralCategory-${VERSION}.txt`),
    read(`PropList-${VERSION}.txt`),
    read(`GraphemeBreakProperty-${VERSION}.txt`),
    read(`emoji-data-${VERSION}.txt`),
    read(`DerivedCoreProperties-${VERSION}-InCB.txt`),
  ]);
  const copyrights = new Set([
    header(scripts, "Scripts"),
    header(gc, "DerivedGeneralCategory"),
    header(props, "PropList"),
    header(gcb, "GraphemeBreakProperty"),
    header(emoji, "emoji-data", new RegExp(`^# Version: ${VERSION}$`, "m")),
    header(incb, "DerivedCoreProperties"),
  ]);
  if (copyrights.size !== 1) throw new Error(`the data files disagree: ${[...copyrights]}`);
  const provenance = new RegExp(
    `^# Excerpt made by monodocs: .*\n# from DerivedCoreProperties-${VERSION.replace(/\./g, "\\.")}` +
      `\\.txt \\(SHA-256 [0-9a-f]{64}\\)`,
    "m",
  );
  if (!provenance.test(incb)) {
    throw new Error("DerivedCoreProperties excerpt: no line naming its source and SHA-256");
  }

  const cjk = [];
  for (const e of entries(scripts, "Scripts")) {
    if (CJK_SCRIPTS.has(e.value)) cjk.push([e.start, e.end]);
  }
  for (const cp of CJK_EXTRA) cjk.push([cp, cp]);

  // Letters, marks, and numbers of every general category: a run of them in a script other than
  // the three above is one token (with `_`, which the tokenizer adds). Marks are there because a
  // spacing mark of Myanmar or Tai Tham is Grapheme_Cluster_Break Other, so it starts a cluster of
  // its own in the middle of a word.
  const word = [];
  for (const e of entries(gc, "DerivedGeneralCategory")) {
    if (/^[LMN]/.test(e.value)) word.push([e.start, e.end]);
  }

  const space = [];
  for (const e of entries(props, "PropList")) {
    if (e.value === "White_Space") space.push([e.start, e.end]);
  }

  const breaks = [];
  for (const e of entries(gcb, "GraphemeBreakProperty")) {
    const code = GCB.indexOf(e.value);
    if (code <= 0) throw new Error(`GraphemeBreakProperty: unknown value ${e.value}`);
    breaks.push([e.start, e.end, code]);
  }

  const pictographic = [];
  for (const e of entries(emoji, "emoji-data")) {
    if (e.value === "Extended_Pictographic") pictographic.push([e.start, e.end]);
  }

  // The excerpt is cut by hand, so each value's count is checked against the UCD's own
  // `# Total code points` line after it: a cut that lost lines fails here.
  let counted = 0;
  for (const line of incb.split("\n")) {
    const total = /^# Total code points: (\d+)$/.exec(line);
    if (total) {
      if (counted !== Number(total[1])) {
        throw new Error(
          `DerivedCoreProperties excerpt: ${counted} code points where it says ${total[1]}`,
        );
      }
      counted = 0;
      continue;
    }
    const m = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;/.exec(line);
    if (m) counted += (m[2] ? parseInt(m[2], 16) : parseInt(m[1], 16)) - parseInt(m[1], 16) + 1;
  }
  if ((incb.match(/^# Total code points: /gm) ?? []).length !== 3) {
    throw new Error("DerivedCoreProperties excerpt: not the three Indic_Conjunct_Break values");
  }

  const conjunct = [];
  for (const e of entries(incb, "DerivedCoreProperties")) {
    if (e.value !== "InCB")
      throw new Error(`DerivedCoreProperties excerpt: ${e.value} is not InCB`);
    const code = INCB.indexOf(e.sub);
    if (code <= 0) throw new Error(`DerivedCoreProperties: unknown InCB value ${e.sub}`);
    conjunct.push([e.start, e.end, code]);
  }

  return {
    copyright: [...copyrights][0],
    cjk: merge(cjk),
    word: merge(word),
    space: merge(space),
    breaks: mergeCoded(breaks),
    pictographic: merge(pictographic),
    conjunct: mergeCoded(conjunct),
  };
}

function hex(cp) {
  return "0x" + cp.toString(16).toUpperCase().padStart(4, "0");
}

function rows(ranges) {
  return ranges
    .map((r) => `  ${r.map((v, i) => (i < 2 ? hex(v) : String(v))).join(", ")},`)
    .join("\n");
}

/** Renders the TypeScript module. */
export function render(t) {
  const table = (name, doc, ranges) =>
    `/** ${doc} */\n// prettier-ignore\nexport const ${name}: readonly number[] = [\n${rows(ranges)}\n];\n`;
  return `/*!
 * Script, general category, White_Space, Grapheme_Cluster_Break, Extended_Pictographic, and
 * Indic_Conjunct_Break ranges, derived from the Unicode Character Database.
 * ${t.copyright} Distributed under the Unicode License v3, reproduced in
 * scripts/data/LICENSE-Unicode.txt and in the distribution's THIRD-PARTY-NOTICES.txt.
 */
// Generated by scripts/generate-diff-unicode.mjs from the Unicode ${VERSION} data files. Do not edit;
// a test fails when this file and the data files disagree.

/** The Unicode version the tables were generated from. */
export const DIFF_UNICODE_VERSION = "${VERSION}";

/** Grapheme_Cluster_Break values by the code the break table holds. */
export const GCB_VALUES = [
${GCB.map((v) => `  "${v}",`).join("\n")}
] as const;

/** Indic_Conjunct_Break values by the code the conjunct table holds. */
export const INCB_VALUES = [${INCB.map((v) => `"${v}"`).join(", ")}] as const;

${table(
  "CJK_RANGES",
  "Characters that are one token each: Han, Hiragana, Katakana, 〆, ー, and ｰ. Flattened [start, end, …].",
  t.cjk,
)}
${table("WORD_RANGES", "Letters, marks, and numbers (general category L, M, and N). Flattened [start, end, …].", t.word)}
${table("SPACE_RANGES", "White_Space. Flattened [start, end, …].", t.space)}
${table(
  "GRAPHEME_BREAK_RANGES",
  "Grapheme_Cluster_Break other than Other. Flattened [start, end, code, …], codes as GCB_VALUES.",
  t.breaks,
)}
${table("PICTOGRAPHIC_RANGES", "Extended_Pictographic. Flattened [start, end, …].", t.pictographic)}
${table(
  "CONJUNCT_RANGES",
  "Indic_Conjunct_Break other than None. Flattened [start, end, code, …], codes as INCB_VALUES.",
  t.conjunct,
)}`;
}

async function main() {
  const expected = render(await parse());
  if (process.argv.includes("--check")) {
    const actual = await readFile(TABLE_FILE, "utf8").catch(() => "");
    if (actual !== expected) {
      console.error("src/diff/unicodeTables.ts does not match the data files; regenerate it.");
      process.exit(1);
    }
    return;
  }
  await writeFile(TABLE_FILE, expected, "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

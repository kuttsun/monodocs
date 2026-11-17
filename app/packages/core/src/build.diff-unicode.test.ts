import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSite } from "./build";
import type { Page } from "./types";

/**
 * The difference inside a changed block gives the same markup whatever Node runs the build (roadmap
 * 7.3.6, 12.4): its tokens and grapheme clusters come from tables generated from one Unicode
 * version, not from the regular-expression engine or `Intl`, which follow the Node's ICU. What this
 * file shows across Nodes is the tokens: the clusters of its emoji, flag, and conjunct are the same
 * under both Nodes' ICU, and `diff/graphemes.test.ts` checks the clusters against Unicode's own test. PR CI
 * runs this file on the oldest Node `engines` allows and on a current one, whose Unicode versions
 * differ; the fixture holds characters only the newer one knows as letters, one of them inside a
 * word that changes, which a tokenizer following the Node would split there.
 */
let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "monodocs-diff-unicode-"));
  vi.spyOn(process, "cwd").mockReturnValue(join(base, "now"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

/** U+323B0, the first of CJK Unified Ideographs Extension J, assigned in Unicode 17.0. */
const EXT_J = "\u{323B0}";

/**
 * U+A7CE, a Latin letter assigned in Unicode 17.0, inside a word whose last letter changes: a
 * tokenizer that followed the Node would end the word at it where the Node does not know it as a
 * letter, and mark the last letter alone instead of the word.
 */
const LATIN = "\uA7CE";

const EARLIER =
  "# A\n\n家族 👨‍👩‍👧 で 🇯🇵 に行った。\n\nक्षमा करें, यह पुराना है।\n\n" +
  `名前は${EXT_J}子です。\n\nThe word ka${LATIN}ab is spelt here.\n`;
const CURRENT =
  "# A\n\n家族 👨‍👩‍👦 で 🇯🇵 に行った。\n\nक्षमा करें, यह नया है।\n\n" +
  `名前は${EXT_J}美です。\n\nThe word ka${LATIN}ac is spelt here.\n`;

/** The changed blocks of a page's HTML, in order, and the templates one column puts back. */
function changedMarkup(html: string): string[] {
  return [
    ...html.matchAll(/<p [^>]*data-monodocs-diff-block="changed"[^>]*>[\s\S]*?<\/p>/g),
    ...html.matchAll(/<template data-monodocs-diff-inline="\d+">[\s\S]*?<\/template>/g),
  ].map((match) => match[0]);
}

describe("the difference inside a block on any Node (7.3.6)", () => {
  it("writes the same markup whatever the Node's Unicode version", async () => {
    for (const [dir, text] of [
      ["then", EARLIER],
      ["now", CURRENT],
    ] as const) {
      await mkdir(join(base, dir, "docs"), { recursive: true });
      await writeFile(join(base, dir, "docs/a.md"), text);
    }
    let pages: Page[] = [];
    await buildSite(
      { outputFile: join(base, "out.html"), diff: { dir: "../then", label: "v1" } },
      { onWritten: (written) => (pages = written) },
    );
    // The emoji joined by ZWJ is replaced whole, the flag is never split, the conjunct's word is
    // kept, the character of Extension J is one token, equal on both sides, and the word holding
    // U+A7CE is one word, replaced whole.
    expect(changedMarkup(pages.find((page) => page.route === "/a")!.html)).toEqual([
      '<p data-monodocs-diff-pair="2" data-monodocs-diff-block="changed">家族 <del data-monodocs-diff="">👨‍👩‍👧</del> で 🇯🇵 に行った。</p>',
      '<p data-monodocs-diff-pair="3" data-monodocs-diff-block="changed">क्षमा करें, यह <del data-monodocs-diff="">पुराना</del> है।</p>',
      `<p data-monodocs-diff-pair="4" data-monodocs-diff-block="changed">名前は${EXT_J}<del data-monodocs-diff="">子</del>です。</p>`,
      `<p data-monodocs-diff-pair="5" data-monodocs-diff-block="changed">The word <del data-monodocs-diff="">ka${LATIN}ab</del> is spelt here.</p>`,
      '<p data-monodocs-diff-pair="2" data-monodocs-diff-block="changed">家族 <!-- monodocs-diff-inline 0 --><ins data-monodocs-diff="">👨‍👩‍👦</ins> で 🇯🇵 に行った。</p>',
      '<p data-monodocs-diff-pair="3" data-monodocs-diff-block="changed">क्षमा करें, यह <!-- monodocs-diff-inline 1 --><ins data-monodocs-diff="">नया</ins> है।</p>',
      `<p data-monodocs-diff-pair="4" data-monodocs-diff-block="changed">名前は${EXT_J}<!-- monodocs-diff-inline 2 --><ins data-monodocs-diff="">美</ins>です。</p>`,
      `<p data-monodocs-diff-pair="5" data-monodocs-diff-block="changed">The word <!-- monodocs-diff-inline 3 --><ins data-monodocs-diff="">ka${LATIN}ac</ins> is spelt here.</p>`,
      '<template data-monodocs-diff-inline="0"><del data-monodocs-diff="">👨‍👩‍👧</del></template>',
      '<template data-monodocs-diff-inline="1"><del data-monodocs-diff="">पुराना</del></template>',
      '<template data-monodocs-diff-inline="2"><del data-monodocs-diff="">子</del></template>',
      `<template data-monodocs-diff-inline="3"><del data-monodocs-diff="">ka${LATIN}ab</del></template>`,
    ]);
  });

  it("holds characters that only some of the Nodes it runs on know as letters", () => {
    // Whether this Node's regular-expression engine reads the character as a letter follows its
    // Unicode version; PR CI says which it expects of each Node it runs, so the two runs differ.
    const known = Number(process.versions.unicode!.split(".")[0]) >= 17;
    const expected = process.env.MONODOCS_EXPECT_UNICODE_17;
    for (const ch of [EXT_J, LATIN]) {
      const letter = /\p{L}/u.test(ch);
      expect(letter).toBe(known);
      if (expected !== undefined && expected !== "") expect(String(letter)).toBe(expected);
    }
  });
});

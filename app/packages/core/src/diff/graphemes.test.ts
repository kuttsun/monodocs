import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { graphemeClusters } from "./graphemes";
import { DIFF_UNICODE_VERSION } from "./unicodeTables";

describe("the Unicode tables of the comparison inside a block", () => {
  it("match the vendored Unicode data files they were generated from", async () => {
    const script = fileURLToPath(
      new URL("../../scripts/generate-diff-unicode.mjs", import.meta.url),
    );
    // Exits 1 when regenerating from the data files would change the tables.
    await expect(promisify(execFile)(process.execPath, [script, "--check"])).resolves.toBeDefined();
    expect(DIFF_UNICODE_VERSION).toBe("18.0.0");
  });
});

describe("graphemeClusters", () => {
  // Every case of the Unicode version's own conformance test: `÷` marks a break, `×` none.
  const file = fileURLToPath(
    new URL(`../../scripts/data/GraphemeBreakTest-${DIFF_UNICODE_VERSION}.txt`, import.meta.url),
  );
  const cases = readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter((line) => line !== "");

  it("reads the conformance file of the tables' Unicode version", () => {
    expect(readFileSync(file, "utf8")).toMatch(
      new RegExp(`^# GraphemeBreakTest-${DIFF_UNICODE_VERSION.replace(/\./g, "\\.")}\\.txt$`, "m"),
    );
    expect(cases.length).toBeGreaterThan(800);
  });

  it("splits every case of GraphemeBreakTest.txt as it says", () => {
    const failures: string[] = [];
    for (const line of cases) {
      const expected = line
        .replace(/^÷\s*|\s*÷$/g, "")
        .split(/\s*÷\s*/)
        .map((cluster) =>
          String.fromCodePoint(...cluster.split(/\s*×\s*/).map((cp) => parseInt(cp, 16))),
        );
      const actual = graphemeClusters(expected.join(""));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(line);
    }
    expect(failures).toEqual([]);
  });

  it("keeps an emoji joined by ZWJ, a flag, and a Devanagari conjunct whole", () => {
    expect(graphemeClusters("👩‍💻")).toEqual(["👩‍💻"]);
    expect(graphemeClusters("🇯🇵🇺🇸")).toEqual(["🇯🇵", "🇺🇸"]);
    // क्ष: KA, VIRAMA, SSA, one cluster under GB9c (Unicode 15.1 and later).
    expect(graphemeClusters("क्ष")).toEqual(["क्ष"]);
    expect(graphemeClusters("é")).toEqual(["é"]);
    // A halfwidth voiced mark is Extend, so it stays with its kana.
    expect(graphemeClusters("ｶﾞｲﾄﾞ")).toEqual(["ｶﾞ", "ｲ", "ﾄﾞ"]);
    expect(graphemeClusters("a\r\nb")).toEqual(["a", "\r\n", "b"]);
    expect(graphemeClusters("")).toEqual([]);
  });
});

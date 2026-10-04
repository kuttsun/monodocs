import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { loadConfig } from "./config";

/**
 * `sources.lineBreak` (roadmap 12.6): one key for both formats, a default that changes nothing, and
 * a search index that agrees with the HTML under every value.
 */
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-linebreak-"));
  await writeFile(join(dir, "a.md"), "# A\n\n日本語の文。\n次の文。\nEnglish\nline\n");
  await writeFile(join(dir, "b.adoc"), "= B\n\n日本語の文。\n次の文。\nEnglish\nline\n");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function build(configBody?: string): Promise<string> {
  const configFile = join(dir, "monodocs.config.yml");
  await writeFile(configFile, configBody ?? "");
  const out = join(dir, "out.html");
  await buildSite({ configFile, inputDir: dir, outputFile: out, format: "html" });
  return readFile(out, "utf8");
}

/** The page text the client searches, as embedded in the document. */
function searchText(html: string): string[] {
  const json = /window\.__MONODOCS_DATA__ = (\{.*\});/.exec(html)![1]!;
  return (JSON.parse(json) as { pages: { text: string }[] }).pages.map((p) => p.text);
}

describe("sources.lineBreak", () => {
  it("defaults to space, and writing space produces the same bytes as leaving it out", async () => {
    expect((await loadConfig({ inputDir: dir }, dir)).lineBreak).toBe("space");
    const unset = await build();
    const space = await build("sources:\n  lineBreak: space\n");
    expect(space).toBe(unset);
    expect(unset).toContain("日本語の文。\n次の文。");
  });

  it("leaves an existing fixture byte for byte as it was under space", async () => {
    // examples/ja is written one sentence per line, so it is the fixture a change here would move.
    // It is also the first build of this process with code samples in it, which is what makes the
    // comparison honest: highlighting no longer depends on what an earlier build loaded.
    const fixture = fileURLToPath(new URL("../../../../examples/ja", import.meta.url));
    const outputs: string[] = [];
    for (const body of ["", "sources:\n  lineBreak: space\n"]) {
      const configFile = join(dir, "monodocs.config.yml");
      await writeFile(configFile, body);
      const out = join(dir, "fixture.html");
      await buildSite({ configFile, inputDir: fixture, outputFile: out, format: "html" });
      outputs.push(await readFile(out, "utf8"));
    }
    expect(outputs[1]).toBe(outputs[0]);
    expect(outputs[0]).toMatch(/。\n[^\n<]/);
  }, 60_000);

  it("applies one rule to Markdown and AsciiDoc alike", async () => {
    const html = await build("sources:\n  lineBreak: join\n");
    expect(html).toContain("<p>日本語の文。次の文。\nEnglish\nline</p>");
    expect(html.match(/<p>日本語の文。次の文。/g)).toHaveLength(2);
    for (const text of searchText(html)) expect(text).toContain("日本語の文。次の文。");

    const breaks = await build("sources:\n  lineBreak: break\n");
    expect(breaks.match(/<p>日本語の文。<br>\n次の文。<br>\nEnglish<br>\nline/g)).toHaveLength(2);
  });

  it("rejects a value it does not know", async () => {
    await writeFile(join(dir, "monodocs.config.yml"), "sources:\n  lineBreak: br\n");
    await expect(
      loadConfig({ configFile: join(dir, "monodocs.config.yml"), inputDir: dir }, dir),
    ).rejects.toThrow(/lineBreak/);
  });
});

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { loadConfig } from "./config";

/**
 * roadmap.md 12.1 says its example is the configuration the current release accepts. Kept as prose
 * it drifted: it carried twelve keys the schema does not have, so once 12.2 made every object
 * strict, copying this project's own example produced `Unrecognized key`. A careful re-read is what
 * failed; extracting the block and loading it is what holds.
 */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

type Example = { label: string; file: string; heading: string };

/** Both language versions ship, so both are checked. */
const EXAMPLES: Example[] = [
  { label: "English", file: "docs/roadmap.md", heading: "### 12.1 Configuration Example" },
  { label: "Japanese", file: "docs/ja/roadmap.md", heading: "### 12.1 設定例" },
];

/**
 * The example is the one YAML block inside 12.1. The section is bounded by the next `###` heading
 * so that a block belonging to 12.2 can never be read as this one, and the block count is asserted
 * rather than taking the first match: a section that grew a second example would otherwise leave
 * half of it unchecked.
 */
async function readExample(example: Example): Promise<string> {
  const text = await readFile(join(REPO_ROOT, example.file), "utf8");
  const start = text.indexOf(`\n${example.heading}\n`);
  if (start === -1) {
    throw new Error(`${example.file}: no section titled ${example.heading}`);
  }
  const next = text.indexOf("\n### ", start + 1);
  const section = text.slice(start, next === -1 ? text.length : next);
  const blocks = [...section.matchAll(/\n```yaml\n([\s\S]*?)\n```\n/g)];
  if (blocks.length !== 1) {
    throw new Error(
      `${example.file}: expected one YAML block under ${example.heading}, found ${blocks.length}`,
    );
  }
  return blocks[0][1];
}

/** Every key path in a parsed configuration, `pdf.margin.top` included. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...keyPaths(child, path)];
  });
}

describe("the configuration example in roadmap.md 12.1", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "monodocs-example-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeConfig(yaml: string): Promise<void> {
    await writeFile(join(dir, "monodocs.config.yml"), yaml);
  }

  for (const example of EXAMPLES) {
    it(`is a configuration monodocs loads without a warning (${example.label})`, async () => {
      const yaml = await readExample(example);
      await writeConfig(yaml);
      const config = await loadConfig({}, dir);
      // A warning would mean the example teaches a spelling the tool is asking authors to leave,
      // which is the same failure as a key that does not load, one release earlier.
      expect(config.warnings).toEqual([]);
      expect(config.configFilePath).toBe(join(dir, "monodocs.config.yml"));
      // The example reached the resolved configuration: an extraction that came back empty would
      // load without a warning too, and would assert nothing about the block in the document.
      expect(config.title).toBe((parseYaml(yaml) as { title: string }).title);
    });

    it(`is checked against the schema rather than skipped (${example.label})`, async () => {
      // The control for the assertion above: an extraction that returned an empty string, or a
      // block of nothing but comments, would load without a warning just as well. `search.enabled`
      // is one of the twelve keys the example used to carry.
      await writeConfig(`${await readExample(example)}\nsearch:\n  enabled: true\n`);
      await expect(loadConfig({}, dir)).rejects.toThrow(/Unrecognized key/i);
    });
  }

  it("carries the same keys in both languages", async () => {
    // The two differ in their comments and in the strings an example needs — the title, a label —
    // but not in what they configure. A key added to one mirror and not the other is the drift
    // that a reader of the other language would be the last to find.
    const [en, ja] = await Promise.all(EXAMPLES.map(readExample));
    const paths = keyPaths(parseYaml(en));
    // The premise first: two examples that both extracted to nothing would agree perfectly.
    expect(paths).toContain("pdf.margin.top");
    expect(keyPaths(parseYaml(ja)).sort()).toEqual(paths.sort());
  });
});

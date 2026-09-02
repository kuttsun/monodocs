import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { loadConfig } from "./config";

/**
 * `sources.asciidoc.attributes` has been promised since before 1.0 and never existed (roadmap.md
 * 17.5). It cannot be a map handed straight to Asciidoctor: attributes set through the API are
 * locked rather than defaulted, and some of them move the boundary monodocs relies on. So the key
 * exists and its contents are classified.
 */
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-adoc-attrs-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeConfig(body: string): Promise<string> {
  const path = join(dir, "monodocs.config.yml");
  await writeFile(path, body);
  return path;
}

async function build(configBody: string): Promise<string> {
  const configFile = await writeConfig(configBody);
  const out = join(dir, "out.html");
  await buildSite({ configFile, inputDir: dir, outputFile: out, format: "html" });
  return readFile(out, "utf8");
}

describe("setting an attribute", () => {
  it("applies a presentational attribute across the document set", async () => {
    await writeFile(join(dir, "a.adoc"), "= A\n\n== Section\n\nBody.\n");

    const html = await build("sources:\n  asciidoc:\n    attributes:\n      sectnums: true\n");

    expect(html).toContain("1. Section");
  });

  it("applies an author's own attribute, recognised by shape rather than enumerated", async () => {
    await writeFile(join(dir, "a.adoc"), "= A\n\nShipping {product} {release}.\n");

    const html = await build(
      "sources:\n" +
        "  asciidoc:\n" +
        "    attributes:\n" +
        '      product: "Widget"\n' +
        "      release: 7\n",
    );

    expect(html).toContain("Shipping Widget 7.");
  });

  /**
   * The point of the key. Asciidoctor's API locks an attribute; a configuration file states what
   * every document gets **unless it says otherwise**, which is the opposite. The `@` suffix is what
   * makes the difference, measured rather than assumed.
   */
  it("sets a default the document can override", async () => {
    await writeFile(join(dir, "a.adoc"), "= A\n:product: Gadget\n\nShipping {product}.\n");

    const html = await build('sources:\n  asciidoc:\n    attributes:\n      product: "Widget"\n');

    expect(html).toContain("Shipping Gadget.");
  });

  it("sets a default the document can turn off", async () => {
    await writeFile(join(dir, "a.adoc"), "= A\n:sectnums!:\n\n== Section\n\nBody.\n");

    const html = await build("sources:\n  asciidoc:\n    attributes:\n      sectnums: true\n");

    expect(html).not.toContain("1. Section");
    expect(html).toContain("Section");
  });

  it("leaves a document alone when nothing is configured", async () => {
    await writeFile(join(dir, "a.adoc"), "= A\n\n== Section\n\nBody.\n");

    const html = await build("title: T\n");

    expect(html).not.toContain("1. Section");
  });
});

describe("what the key refuses", () => {
  async function loadWith(attribute: string): Promise<unknown> {
    const configFile = await writeConfig(
      `sources:\n  asciidoc:\n    attributes:\n      ${attribute}\n`,
    );
    return loadConfig({ configFile, inputDir: dir }, dir);
  }

  it("refuses the attributes that move where files are read from", async () => {
    for (const name of [
      "allow-uri-read",
      "docinfo",
      "backend",
      "data-uri",
      "imagesdir",
      "source-highlighter",
    ]) {
      await expect(loadWith(`${name}: "x"`)).rejects.toThrow(/refuses/i);
    }
  });

  it("refuses the sd- namespace, which belongs to monodocs", async () => {
    await expect(loadWith('sd-title: "Mine"')).rejects.toThrow(/refuses/i);
  });

  it("does not accept the sandbox itself, nor what decides where a path resolves", async () => {
    for (const name of ["safe", "base_dir", "docdir", "docfile", "outdir"]) {
      await expect(loadWith(`${name}: "x"`)).rejects.toThrow(/does not accept/i);
    }
  });

  it("does not accept showtitle, which the page title and every element ID are built from", async () => {
    await expect(loadWith("showtitle: false")).rejects.toThrow(/does not accept|cannot unset/i);
  });

  it("classifies by the lower-cased name, as Asciidoctor does", async () => {
    await expect(loadWith('ALLOW-URI-READ: "x"')).rejects.toThrow(/refuses/i);
  });

  it("does not offer unsetting, which a document does for itself", async () => {
    await expect(loadWith('"sectnums!": ""')).rejects.toThrow(/cannot unset/i);
    await expect(loadWith("sectnums: false")).rejects.toThrow(/cannot unset/i);
  });

  it("refuses a value already ending in the soft-set marker", async () => {
    await expect(loadWith('product: "Widget@"')).rejects.toThrow(/ends in/i);
  });
});

describe("what reaches Asciidoctor", () => {
  it("carries the soft-set marker on every value", async () => {
    const configFile = await writeConfig(
      "sources:\n  asciidoc:\n    attributes:\n      sectnums: true\n      product: Widget\n",
    );

    const config = await loadConfig({ configFile, inputDir: dir }, dir);

    expect(config.asciidocAttributes).toEqual({ sectnums: "@", product: "Widget@" });
  });

  it("is empty when the key is absent", async () => {
    const configFile = await writeConfig("title: T\n");

    const config = await loadConfig({ configFile, inputDir: dir }, dir);

    expect(config.asciidocAttributes).toEqual({});
  });
});

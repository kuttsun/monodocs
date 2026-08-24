import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postprocessPages } from "./postprocess";
import type { Diagnostic } from "../diagnostics";
import type { Page } from "../types";

function page(relativePath: string, html: string, sourcePath?: string): Page {
  return {
    id: relativePath.replace(/\W+/g, "-"),
    route: `/${relativePath.replace(/\.md$/, "")}`,
    sourcePath: sourcePath ?? `/docs/${relativePath}`,
    relativePath,
    format: "markdown",
    title: "T",
    rawSource: "",
    html,
    text: "",
    headings: [],
    anchors: [],
    links: [],
    assets: [],
  };
}

const baseOptions = {
  inputDir: "/docs",
  sourceExtensions: [".md"],
  embedImages: false,
  maxInlineSize: 5 * 1024 * 1024,
  onLargeImage: "warn" as const,
  mermaidEnabled: false,
  mermaidMode: "client" as const,
  codeHighlight: false,
};

async function check(html: string): Promise<Diagnostic[]> {
  const result = await postprocessPages([page("index.md", html)], baseOptions);
  return result.warnings;
}

function codes(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

describe("a heading level skipped", () => {
  it("is reported, naming the heading and the two levels", async () => {
    const found = await check("<h1>Home</h1><h2>Section</h2><h4>Details</h4>");
    expect(codes(found)).toEqual(["heading/level-skipped"]);
    expect(found[0]?.message).toContain('"Details"');
    expect(found[0]?.message).toContain("h4");
    expect(found[0]?.message).toContain("h2");
    expect(found[0]?.path).toBe("index.md");
    // The tree here is the rendered HTML, so a line would describe the generated document rather
    // than the file the author edits.
    expect(found[0]?.line).toBeUndefined();
  });

  it("is not reported for a level that follows, or for going back up", async () => {
    expect(await check("<h1>a</h1><h2>b</h2><h3>c</h3>")).toEqual([]);
    // Two sections deep and back out is how a document is shaped, not a skip.
    expect(await check("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2><h3>e</h3>")).toEqual([]);
  });

  it("is not reported for the first heading of a page, whatever its level", async () => {
    // A page whose title comes from frontmatter legitimately opens at h2, and a document whose
    // sections start at h3 is unusual rather than broken. Calling either a skip would report most
    // well-formed documents, which is how a check teaches everyone to ignore it.
    expect(await check("<h2>Section</h2><h3>Sub</h3>")).toEqual([]);
    expect(await check("<h3>Deep</h3>")).toEqual([]);
  });

  it("is reported once per skip rather than once per page", async () => {
    const found = await check("<h1>a</h1><h3>b</h3><h4>c</h4><h6>d</h6>");
    expect(codes(found)).toEqual(["heading/level-skipped", "heading/level-skipped"]);
  });
});

describe("an image with no alt attribute", () => {
  it("is reported, naming the image and the page", async () => {
    const found = await check('<p><img src="diagram.png"></p>');
    expect(codes(found)).toEqual(["image/no-alt"]);
    expect(found[0]?.message).toContain("diagram.png");
    expect(found[0]?.path).toBe("index.md");
  });

  it("is not reported for an explicitly empty alt", async () => {
    // `alt=""` is how an author marks a decorative image, and the lightbox already honours the
    // distinction. Reporting it would push authors into writing something — anything — into the
    // attribute, which is worse for a reader using a screen reader than the empty string.
    expect(await check('<p><img src="rule.png" alt=""></p>')).toEqual([]);
    expect(await check('<p><img src="photo.png" alt="A photo of the machine"></p>')).toEqual([]);
  });
});

describe("what the checks report is what the author wrote", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "monodocs-checks-"));
    await mkdir(join(dir, "docs"), { recursive: true });
    // A 1x1 GIF, small enough to be embedded under any limit.
    await writeFile(
      join(dir, "docs", "pixel.gif"),
      Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("names the source of an image rather than the data URI it becomes", async () => {
    // The check runs before embedding. After it, every `src` is a base64 payload, and a finding
    // naming one would be unreadable and unsearchable.
    const docs = join(dir, "docs");
    const result = await postprocessPages(
      [page("index.md", '<p><img src="pixel.gif"></p>', join(docs, "index.md"))],
      { ...baseOptions, inputDir: docs, embedImages: true },
    );
    const finding = result.warnings.find((w) => w.code === "image/no-alt");
    expect(finding?.message).toContain("pixel.gif");
    expect(finding?.message).not.toContain("base64");
    // The image was embedded all the same: the check does not stand in for the work.
    expect(result.warnings.filter((w) => w.code === "image/not-found")).toEqual([]);
  });
});

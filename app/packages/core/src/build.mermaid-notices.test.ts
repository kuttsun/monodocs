import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import type { MermaidPrerenderer } from "./pipeline/mermaidPrerender";
import { loadMermaidNotices, noticeComment } from "./themes/mermaid";

/**
 * The inline Mermaid runtime carries its third-party notices into the output HTML, exactly when the
 * runtime itself is emitted (roadmap 21.3).
 */
const HEADER = "Third-party notices for the Mermaid runtime";
const DIAGRAM = "# A\n\n```mermaid\ngraph TD; A-->B\n```\n";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-notices-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete (globalThis as { __MONODOCS_ASSETS__?: unknown }).__MONODOCS_ASSETS__;
});

async function buildResult(
  configBody: string,
  page = DIAGRAM,
  internals: { mermaidPrerenderer?: MermaidPrerenderer } = {},
) {
  await writeFile(join(dir, "a.md"), page);
  const configFile = join(dir, "monodocs.config.yml");
  await writeFile(configFile, configBody);
  const out = join(dir, "out.html");
  const result = await buildSite(
    { configFile, inputDir: dir, outputFile: out, format: "html" },
    internals,
  );
  return { result, html: await readFile(out, "utf8"), out };
}

async function build(...args: Parameters<typeof buildResult>) {
  return (await buildResult(...args)).html;
}

const count = (html: string, s: string) => html.split(s).length - 1;

describe("the Mermaid runtime notices", () => {
  it("list the components the runtime's source map names", async () => {
    const script = fileURLToPath(
      new URL("../scripts/generate-mermaid-notices.mjs", import.meta.url),
    );
    // Exits 1 when the runtime's components differ from those the committed notices list.
    await expect(promisify(execFile)(process.execPath, [script, "--check"])).resolves.toBeDefined();
    const notices = await loadMermaidNotices();
    // Versions the runtime carries that node_modules does not resolve at the top level.
    expect(notices).toMatch(/^lodash-es@4\.17\.23 {2}— {2}MIT$/m);
    expect(notices).toMatch(/^@mermaid-js\/parser \(built with mermaid@\d+\.\d+\.\d+\)/m);
    // Packages a component bundles into its own pre-built file, which the source map cannot see,
    // and code copied into one under another licence.
    for (const [name, parent] of [
      ["hachure-fill", "roughjs"],
      ["points-on-path", "roughjs"],
      ["fmin", "@upsetjs/venn.js"],
      ["heap", "cytoscape"],
      ["gl-matrix", "cytoscape"],
      ["lodash", "cytoscape"],
    ]) {
      expect(notices).toMatch(new RegExp(`^${name}@[\\d.]+ \\(bundled inside ${parent}@`, "m"));
    }
    expect(notices).toContain("Ralf S. Engelschall");
    expect(notices).toContain("adopted, with changes, from JamaJS");
    // A licence file is text, not a script that happens to be named license-*.
    expect(notices).not.toMatch(/^import /m);
    // Every component carries a licence text, fastdom's taken from its README.
    expect(notices).not.toContain("UNKNOWN");
    expect(notices).toMatch(/^fastdom@[\d.]+ {2}— {2}MIT\n-+\n\(From the package's README\.\)/m);
    expect(notices).toContain("Copyright (c) 2016 Wilson Page");
  });

  it("are emitted once with the inline runtime and a diagram, inside its script", async () => {
    const html = await build("mermaid:\n  runtime: inline\n");
    expect(count(html, HEADER)).toBe(1);
    const at = html.indexOf(HEADER);
    expect(html.lastIndexOf("<script>", at)).toBeGreaterThan(html.lastIndexOf("</script>", at));
    expect(html.slice(at - "/*!\n".length, at)).toBe("/*!\n");
  });

  it("are not emitted for the CDN runtime, for pre-render, or without a diagram", async () => {
    expect(await build("mermaid:\n  runtime: cdn\n")).not.toContain(HEADER);
    expect(await build("mermaid:\n  runtime: inline\n", "# A\n\nNo diagram.\n")).not.toContain(
      HEADER,
    );
    const prerenderer: MermaidPrerenderer = {
      async render(id) {
        return `<svg id="${id}"><g/></svg>`;
      },
      async close() {},
    };
    const html = await build("mermaid:\n  mode: pre-render\n", DIAGRAM, {
      mermaidPrerenderer: prerenderer,
    });
    expect(html).toContain('<svg id="mermaid-0">');
    expect(html).not.toContain(HEADER);
  });

  it("survive a custom theme and branding: false", async () => {
    const theme = join(dir, "theme");
    await mkdir(theme);
    await writeFile(
      join(theme, "template.html"),
      "<!doctype html><html><head><style>{{style}}</style></head><body>{{sidebar}}{{pages}}" +
        "<script>window.__MONODOCS_DATA__ = {{siteDataJson}};</script>" +
        "<script>{{appJs}}</script>{{bodyScripts}}</body></html>",
    );
    const html = await build(
      `mermaid:\n  runtime: inline\nhtml:\n  branding: false\n  theme: "${theme}"\n`,
    );
    expect(count(html, HEADER)).toBe(1);
  });

  it("are counted in the size report's Mermaid runtime line", async () => {
    const { result, out } = await buildResult("mermaid:\n  runtime: inline\n");
    const notices = Buffer.byteLength(noticeComment(await loadMermaidNotices()));
    const lib = Buffer.byteLength(
      await readFile(createRequire(import.meta.url).resolve("mermaid/dist/mermaid.min.js"), "utf8"),
    );
    const parts = result.sizes[0]!.breakdown!;
    expect(parts.mermaid).toBeGreaterThan(notices + lib);
    expect(parts.images.bytes + parts.mermaid + parts.pageData + parts.document).toBe(
      (await stat(out)).size,
    );
  });

  it("come from the embedded assets when the single executable carries them", async () => {
    (globalThis as { __MONODOCS_ASSETS__?: unknown }).__MONODOCS_ASSETS__ = {
      mermaidInline: "window.__embeddedRuntime=1;",
      mermaidNotices: "EMBEDDED NOTICES",
    };
    const html = await build("mermaid:\n  runtime: inline\n");
    expect(html).toContain("/*!\nEMBEDDED NOTICES\n*/\nwindow.__embeddedRuntime=1;");
    expect(html).not.toContain(HEADER);
  });
});

describe("noticeComment", () => {
  it("cannot be closed early by the text it carries", () => {
    const text = "a */ b </script><script>alert(1)</script> c </SCRIPT d <!-- e -->";
    const comment = noticeComment(text);
    // The only comment terminator is the final one, and the script element cannot end inside it.
    expect(comment.indexOf("*/")).toBe(comment.length - "*/\n".length);
    expect(comment).not.toMatch(/<\/script/i);
    expect(comment).not.toContain("<!--");
    // It is still one valid comment to a JavaScript parser.
    expect(() => new Function(`${comment}return 1;`)).not.toThrow();
  });
});

// Whether the runtime still runs with the notices in front of it is a browser's question.
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

describe.skipIf(!chromium)("the inline runtime with its notices (real Chromium)", () => {
  it("still renders a diagram, with no script error", async () => {
    const { out } = await buildResult("mermaid:\n  runtime: inline\n");
    const puppeteer = (await import("puppeteer-core")).default;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromium as string,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(pathToFileURL(out).href, { waitUntil: "load" });
      await page.waitForSelector("#content .mermaid svg", { timeout: 20_000 });
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60_000);
});

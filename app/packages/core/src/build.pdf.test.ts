import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite, resolveOutputs } from "./build";
import { loadConfig } from "./config";
import type { PdfGenerator, PdfRenderOptions } from "./pipeline/renderPdf";

let dir: string;
let docs: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-pdf-"));
  docs = join(dir, "docs");
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "index.md"), "# タイトル\n\n本文。\n");
  await writeFile(join(docs, "guide.md"), "# ガイド\n\n中身。\n");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 受け取った html / options を記録し canned PDF バイト列を返す偽ジェネレータ。 */
function fakePdfGenerator() {
  const calls: { html: string; options: PdfRenderOptions }[] = [];
  const state = { closed: 0 };
  const gen: PdfGenerator = {
    async render(html, options) {
      calls.push({ html, options });
      return new TextEncoder().encode("%PDF-1.4 fake");
    },
    async close() {
      state.closed += 1;
    },
  };
  return { gen, calls, state };
}

describe("resolveOutputs", () => {
  it("html は outputFile をそのまま HTML に使う", async () => {
    const output = join(dir, "abs", "manual.html");
    const c = await loadConfig({ outputFile: output, format: "html" }, dir);
    expect(resolveOutputs(c, dir)).toEqual({ html: output });
  });

  it("pdf は outputFile をそのまま PDF に使う", async () => {
    const output = join(dir, "abs", "manual.pdf");
    const c = await loadConfig({ outputFile: output, format: "pdf" }, dir);
    expect(resolveOutputs(c, dir)).toEqual({ pdf: output });
  });

  it("both はディレクトリ -o の中へ manual.html / manual.pdf を出す", async () => {
    const output = join(dir, "abs", "out");
    const c = await loadConfig({ outputFile: output, format: "both" }, dir);
    expect(resolveOutputs(c, dir)).toEqual({
      html: join(output, "manual.html"),
      pdf: join(output, "manual.pdf"),
    });
  });

  it("both は -o を常にディレクトリ扱いする（ドットを含む名前も誤判定しない）", async () => {
    const output = join(dir, "abs", "dist", "v1.0");
    const c = await loadConfig({ outputFile: output, format: "both" }, dir);
    expect(resolveOutputs(c, dir)).toEqual({
      html: join(output, "manual.html"),
      pdf: join(output, "manual.pdf"),
    });
  });

  it("既定出力は format ごとに拡張子／形が変わる", async () => {
    const base = join(dir, "base");
    const html = await loadConfig({ format: "html" }, base);
    expect(resolveOutputs(html, base)).toEqual({ html: join(base, "dist", "manual.html") });
    const pdf = await loadConfig({ format: "pdf" }, base);
    expect(resolveOutputs(pdf, base)).toEqual({ pdf: join(base, "dist", "manual.pdf") });
    const both = await loadConfig({ format: "both" }, base);
    expect(resolveOutputs(both, base)).toEqual({
      html: join(base, "dist", "manual.html"),
      pdf: join(base, "dist", "manual.pdf"),
    });
  });
});

describe("buildSite - PDF 分岐（偽ジェネレータで browserless）", () => {
  it("format: pdf は PDF のみを書き出し、設定を options へ渡す", async () => {
    const out = join(dir, "pdf-only", "manual.pdf");
    const { gen, calls, state } = fakePdfGenerator();
    const result = await buildSite(
      { inputDir: docs, outputFile: out, format: "pdf", generatorVersion: "1.2.3" },
      { pdfGenerator: gen },
    );
    expect(result.outputs).toEqual([out]);
    expect(existsSync(out)).toBe(true);
    expect(existsSync(join(dir, "pdf-only", "manual.html"))).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.html).toContain(">monodocs v1.2.3</a>");
    expect(calls[0]!.html.match(/class="document-footer"/g)).toHaveLength(1);
    expect(calls[0]!.options.pageSize).toBe("A4");
    expect(calls[0]!.options.margin).toEqual({
      top: "20mm",
      right: "15mm",
      bottom: "20mm",
      left: "15mm",
    });
    expect(calls[0]!.options.printBackground).toBe(true);
    // Mermaid が無いので描画待ちはしない。
    expect(calls[0]!.options.waitForMermaid).toBe(false);
    // 注入されたジェネレータの close は buildSite では呼ばない（呼び出し側の責務）。
    expect(state.closed).toBe(0);
  });

  it("format: both はディレクトリへ HTML と PDF を両方出し、同一 HTML を PDF 化する", async () => {
    const outDir = join(dir, "both");
    const { gen, calls } = fakePdfGenerator();
    const result = await buildSite(
      { inputDir: docs, outputFile: outDir, format: "both" },
      { pdfGenerator: gen },
    );
    expect(result.outputs).toEqual([join(outDir, "manual.html"), join(outDir, "manual.pdf")]);
    expect(existsSync(join(outDir, "manual.html"))).toBe(true);
    expect(existsSync(join(outDir, "manual.pdf"))).toBe(true);
    const writtenHtml = await readFile(join(outDir, "manual.html"), "utf8");
    expect(calls[0]!.html).toBe(writtenHtml);
  });

  it("PDF の pageSize / margin / printBackground は設定から解決される", async () => {
    await writeFile(
      join(docs, "monodocs.config.yml"),
      "pdf:\n  pageSize: Letter\n  printBackground: false\n  margin:\n    top: 10mm\n",
    );
    const { gen, calls } = fakePdfGenerator();
    await buildSite(
      { inputDir: docs, outputFile: join(dir, "cfg", "manual.pdf"), format: "pdf" },
      { pdfGenerator: gen },
    );
    expect(calls[0]!.options.pageSize).toBe("Letter");
    expect(calls[0]!.options.printBackground).toBe(false);
    // 指定していない辺は既定値を使う。
    expect(calls[0]!.options.margin).toEqual({
      top: "10mm",
      right: "15mm",
      bottom: "20mm",
      left: "15mm",
    });
    await rm(join(docs, "monodocs.config.yml"), { force: true });
  });

  it("embeds local images for PDF even when embedImages is false (and warns)", async () => {
    const idir = await mkdtemp(join(tmpdir(), "monodocs-pdf-img-"));
    const idocs = join(idir, "docs");
    await mkdir(idocs, { recursive: true });
    await writeFile(
      join(idocs, "pic.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>',
    );
    await writeFile(join(idocs, "index.md"), "# Pic\n\n![red](./pic.svg)\n");
    await writeFile(join(idocs, "monodocs.config.yml"), "assets:\n  embedImages: false\n");

    const { gen, calls } = fakePdfGenerator();
    const result = await buildSite(
      { inputDir: idocs, outputFile: join(idir, "out.pdf"), format: "pdf" },
      { pdfGenerator: gen },
    );
    // PDF へ渡す HTML では相対画像が data URI に埋め込まれている（外部参照は残さない）。
    expect(calls[0]!.html).toContain("data:image/svg+xml;base64,");
    expect(calls[0]!.html).not.toContain('src="./pic.svg"');
    // embedImages: false を上書きした旨を警告する。
    expect(result.warnings.some((w) => w.includes("画像を埋め込みました"))).toBe(true);
    await rm(idir, { recursive: true, force: true });
  });

  it("embeds large local images for PDF even when onLargeImage is external", async () => {
    const idir = await mkdtemp(join(tmpdir(), "monodocs-pdf-large-"));
    const idocs = join(idir, "docs");
    await mkdir(idocs, { recursive: true });
    await writeFile(
      join(idocs, "big.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="blue"/></svg>',
    );
    await writeFile(join(idocs, "index.md"), "# Big\n\n![blue](./big.svg)\n");
    // maxInlineSize を極小にして svg を「大きい画像」扱いにし、external で外部化させる設定。
    await writeFile(
      join(idocs, "monodocs.config.yml"),
      "assets:\n  maxInlineSize: 10\n  onLargeImage: external\n",
    );

    const { gen, calls } = fakePdfGenerator();
    const result = await buildSite(
      { inputDir: idocs, outputFile: join(idir, "out.pdf"), format: "pdf" },
      { pdfGenerator: gen },
    );
    // PDF では大きい画像も data URI として埋め込む（外部参照のままにしない）。
    expect(calls[0]!.html).toContain("data:image/svg+xml;base64,");
    expect(calls[0]!.html).not.toContain('src="./big.svg"');
    expect(result.warnings.some((w) => w.includes("画像を埋め込みました"))).toBe(true);
    await rm(idir, { recursive: true, force: true });
  });

  it("passes a sidebar-structured outline to the generator (bookmarks on by default)", async () => {
    const { gen, calls } = fakePdfGenerator();
    await buildSite(
      { inputDir: docs, outputFile: join(dir, "bm", "manual.pdf"), format: "pdf" },
      { pdfGenerator: gen },
    );
    const outline = calls[0]!.options.outline;
    expect(outline).toBeDefined();
    // docs は index.md / guide.md（ともにルート）。各ページ dest は page-{id}。
    expect(new Set(outline!.map((n) => n.dest))).toEqual(new Set(["page-index", "page-guide"]));
  });

  it("omits the outline when pdf.bookmarks is false", async () => {
    await writeFile(join(docs, "monodocs.config.yml"), "pdf:\n  bookmarks: false\n");
    const { gen, calls } = fakePdfGenerator();
    await buildSite(
      { inputDir: docs, outputFile: join(dir, "nobm", "manual.pdf"), format: "pdf" },
      { pdfGenerator: gen },
    );
    expect(calls[0]!.options.outline).toBeUndefined();
    await rm(join(docs, "monodocs.config.yml"), { force: true });
  });
});

// 実 Chromium が要るため、存在するときだけ end-to-end で実際の PDF 生成を確認する。
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

describe.skipIf(!chromium)("buildSite - PDF（実 Chromium）", () => {
  it("空でない PDF ファイルを生成する", async () => {
    const out = join(dir, "real", "manual.pdf");
    const result = await buildSite({ inputDir: docs, outputFile: out, format: "pdf" });
    expect(result.outputs).toEqual([out]);
    const buf = await readFile(out);
    expect(buf.byteLength).toBeGreaterThan(1000);
    // PDF のマジックバイト。
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // しおり（サイドバー構造）が付与され、ビューアで開かれる設定になっている。
    const { PDFDocument, PDFName } = await import("pdf-lib");
    const doc = await PDFDocument.load(buf);
    expect(doc.catalog.lookup(PDFName.of("Outlines"))).toBeDefined();
    const pageMode = doc.catalog.lookup(PDFName.of("PageMode"));
    expect(pageMode instanceof PDFName && pageMode.asString()).toBe("/UseOutlines");
  }, 60_000);

  it("makes in-content cross-page links clickable (internal link annotation)", async () => {
    const ldir = await mkdtemp(join(tmpdir(), "monodocs-pdf-links-"));
    const ldocs = join(ldir, "docs");
    await mkdir(ldocs, { recursive: true });
    await writeFile(ldocs + "/index.md", "# Top\n\n[go to guide](./guide.md)\n");
    await writeFile(ldocs + "/guide.md", "# Guide\n\n本文。\n");
    // しおり用サロゲートを除き、本文リンク由来の内部リンクだけを数えるため bookmarks を切る。
    await writeFile(ldocs + "/monodocs.config.yml", "pdf:\n  bookmarks: false\n");
    const out = join(ldir, "manual.pdf");
    await buildSite({ inputDir: ldocs, outputFile: out, format: "pdf" });

    const { PDFDocument, PDFName, PDFDict, PDFArray } = await import("pdf-lib");
    const doc = await PDFDocument.load(await readFile(out));
    let internal = 0;
    for (const page of doc.getPages()) {
      const annots = page.node.lookup(PDFName.of("Annots"));
      if (!(annots instanceof PDFArray)) continue;
      for (let i = 0; i < annots.size(); i++) {
        const a = annots.lookup(i);
        if (!(a instanceof PDFDict)) continue;
        const st = a.lookup(PDFName.of("Subtype"));
        if (!(st instanceof PDFName) || st.asString() !== "/Link") continue;
        // 内部リンク（GoTo）は /Dest を持つ（外部 URI は /A /URI）。
        if (a.lookup(PDFName.of("Dest"))) internal += 1;
      }
    }
    // 本文の `./guide.md` リンクが `#page-guide` へ書き換わり、クリック可能になっている。
    expect(internal).toBeGreaterThanOrEqual(1);
    await rm(ldir, { recursive: true, force: true });
  }, 60_000);
});

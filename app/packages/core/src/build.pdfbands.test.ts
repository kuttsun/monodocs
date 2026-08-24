import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { loadConfig } from "./config";
import { DEFAULT_PDF_FOOTER, EMPTY_PDF_BAND } from "./pipeline/pdfBands";
import type { PdfGenerator, PdfRenderOptions } from "./pipeline/renderPdf";

let dir: string;
let docs: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-bands-"));
  docs = join(dir, "docs");
  await mkdir(docs, { recursive: true });
  // 1 ページに収まらない量にして、ページ番号が実際に増える PDF にする。
  // 本文には数字をひとつも入れない。そうすればページ上に描かれた数字は帯由来しかありえず、
  // 「ページ番号が入っている」ことを座標に頼らず言い切れる。
  const filler = Array.from(
    { length: 120 },
    () => "Filler paragraph of text, no numerals here.",
  ).join("\n\n");
  await writeFile(join(docs, "index.md"), `# Home\n\n${filler}\n`);
  await writeFile(join(docs, "guide.md"), `# Guide\n\n${filler}\n`);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 渡された options を記録するだけの偽ジェネレータ。 */
function fakePdfGenerator() {
  const calls: PdfRenderOptions[] = [];
  const gen: PdfGenerator = {
    async render(_html, options) {
      calls.push(options);
      return new TextEncoder().encode("%PDF-1.4 fake");
    },
    async close() {},
  };
  return { gen, calls };
}

async function buildWith(name: string, configYaml: string) {
  const root = join(dir, name);
  await mkdir(root, { recursive: true });
  const configFile = join(root, "monodocs.config.yml");
  await writeFile(configFile, configYaml);
  const { gen, calls } = fakePdfGenerator();
  await buildSite(
    { inputDir: docs, configFile, outputFile: join(root, "docs.pdf"), format: "pdf" },
    { pdfGenerator: gen },
  );
  return calls[0]!;
}

describe("PDF header and footer bands", () => {
  it("puts page numbers in the footer by default and leaves the header empty", async () => {
    const options = await buildWith("default", "title: T\n");
    expect(options.footer).toBe(DEFAULT_PDF_FOOTER);
    expect(options.footer).toContain('class="pageNumber"');
    expect(options.footer).toContain('class="totalPages"');
    // 全ページに足す唯一のテキストなので、訳の要らない形にしてある。マークアップではなく
    // 描画される中身で見る（CSS のプロパティ名やクラス名は読者の目に触れない）。
    // span は空で、Chromium が印刷時に数字を差し込む。残るのは区切りだけ。
    expect(options.footer!.replace(/<[^>]*>/g, "").trim()).toBe("/");
    expect(options.header).toBe(EMPTY_PDF_BAND);
  });

  it("emits an explicitly empty fragment for false rather than omitting it", async () => {
    // 省略すると Chromium が組み込みの日付＋タイトルへフォールバックし、
    // 「出さない」指定が「頼んでいないものが出る」になる。
    const options = await buildWith("off", "pdf:\n  header: false\n  footer: false\n");
    expect(options.header).toBe(EMPTY_PDF_BAND);
    expect(options.footer).toBe(EMPTY_PDF_BAND);
    expect(options.footer).not.toBe(undefined);
  });

  it("passes a replacement fragment through to both positions", async () => {
    const options = await buildWith(
      "custom",
      "pdf:\n  header: '<span class=\"title\"></span>'\n  footer: '<span class=\"url\"></span>'\n",
    );
    expect(options.header).toBe('<span class="title"></span>');
    expect(options.footer).toBe('<span class="url"></span>');
  });

  it("rejects an empty fragment rather than turning it into a band-less page", async () => {
    const root = join(dir, "emptyfrag");
    await mkdir(root, { recursive: true });
    const configFile = join(root, "monodocs.config.yml");
    await writeFile(configFile, 'pdf:\n  footer: ""\n');
    await expect(loadConfig({ configFile }, root)).rejects.toThrow(/Invalid config file/);
  });
});

// 帯が実際に描かれるかは Chromium にしか答えられない。
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

/**
 * ページに描かれた数字の並びを読む。
 *
 * 演算子を数えるだけでは足りない。既定フッタにはリテラルの `/` があるので、Chromium の差し込みが
 * 完全に壊れて区切りだけが描かれても数は増え、テストは通ってしまう。グリフをフォントの
 * ToUnicode で文字へ戻して読む。
 *
 * どのフォントで描いたかは `Tf` を追って決める。サブセットフォントが複数あると同じコードが
 * 別の文字に割り当てられるため、全フォントの表をまとめて引くと誤って読める。
 *
 * 本文に数字を入れていないので、返ってきた数字はすべて帯由来である。ページ内の座標を解釈せずに
 * 済むのが利点で、Chromium が版面全体に掛ける座標変換に依存しない。
 */
async function pageDigits(bytes: Uint8Array, index: number): Promise<string[]> {
  const { PDFDocument, PDFRawStream, PDFArray, PDFDict, PDFName, decodePDFRawStream } =
    await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPages()[index]!;

  const streamText = (obj: unknown): string => {
    const list = obj instanceof PDFArray ? obj.asArray().map((r) => doc.context.lookup(r)) : [obj];
    let out = "";
    for (const st of list) {
      if (st instanceof PDFRawStream) {
        out += Buffer.from(decodePDFRawStream(st).decode()).toString("latin1");
      }
    }
    return out;
  };

  /** フォントの ToUnicode CMap から グリフコード → 文字 を組み立てる。 */
  const codeMap = (font: InstanceType<typeof PDFDict>): Map<number, string> => {
    const map = new Map<number, string>();
    const ref = font.get(PDFName.of("ToUnicode"));
    if (!ref) return map;
    const cmap = streamText(doc.context.lookup(ref));
    for (const m of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const e of m[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        map.set(parseInt(e[1]!, 16), String.fromCodePoint(parseInt(e[2]!.slice(0, 4), 16)));
      }
    }
    for (const m of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const e of m[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const lo = parseInt(e[1]!, 16);
        const hi = parseInt(e[2]!, 16);
        const dst = parseInt(e[3]!.slice(0, 4), 16);
        for (let c = lo; c <= hi; c++) map.set(c, String.fromCodePoint(dst + (c - lo)));
      }
    }
    return map;
  };

  const byName = new Map<string, Map<number, string>>();
  const fonts = page.node.Resources()?.get(PDFName.of("Font"));
  if (fonts instanceof PDFDict) {
    for (const key of fonts.keys()) {
      const f = doc.context.lookup(fonts.get(key));
      if (f instanceof PDFDict) byName.set(key.asString().replace(/^\//, ""), codeMap(f));
    }
  }

  // `/Fn size Tf` でフォントを切り替え、`<hex> Tj` で描く。順に辿って現在のフォントで読む。
  const raw = streamText(page.node.Contents());
  let current: Map<number, string> | undefined;
  let text = "";
  for (const m of raw.matchAll(/\/([A-Za-z0-9+.-]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj/g)) {
    if (m[1] !== undefined) {
      current = byName.get(m[1]);
      continue;
    }
    const hex = m[2] ?? "";
    for (let i = 0; i + 1 < hex.length; i += 2) {
      const ch = current?.get(parseInt(hex.slice(i, i + 2), 16));
      if (ch !== undefined) text += ch;
    }
  }
  return text.match(/\d+/g) ?? [];
}

/** ページ内容ストリームのテキスト描画演算子（Tj / TJ）の総数。 */
async function textOperatorCount(bytes: Uint8Array): Promise<number> {
  const { PDFDocument, PDFRawStream, PDFArray, decodePDFRawStream } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  let count = 0;
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((ref) => doc.context.lookup(ref))
        : [contents];
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) continue;
      const text = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
      count += (text.match(/\bT[jJ]\b/g) ?? []).length;
    }
  }
  return count;
}

describe.skipIf(!chromium)("PDF bands（実 Chromium）", () => {
  it("draws the page-number footer, and draws nothing when it is turned off", async () => {
    const withRoot = join(dir, "real-on");
    const withoutRoot = join(dir, "real-off");
    await mkdir(withRoot, { recursive: true });
    await mkdir(withoutRoot, { recursive: true });
    await writeFile(join(withRoot, "monodocs.config.yml"), "pdf:\n  bookmarks: false\n");
    await writeFile(
      join(withoutRoot, "monodocs.config.yml"),
      "pdf:\n  bookmarks: false\n  footer: false\n",
    );

    const on = join(withRoot, "docs.pdf");
    const off = join(withoutRoot, "docs.pdf");
    await buildSite({
      inputDir: docs,
      configFile: join(withRoot, "monodocs.config.yml"),
      outputFile: on,
      format: "pdf",
    });
    await buildSite({
      inputDir: docs,
      configFile: join(withoutRoot, "monodocs.config.yml"),
      outputFile: off,
      format: "pdf",
    });

    const onBytes = await readFile(on);
    const offBytes = await readFile(off);
    expect(await textOperatorCount(onBytes)).toBeGreaterThan(await textOperatorCount(offBytes));

    // 数が増えたことだけでは、区切りの `/` だけが描かれても通る。実際に描かれた数字を読む。
    const { PDFDocument } = await import("pdf-lib");
    const total = (await PDFDocument.load(onBytes)).getPageCount();
    expect(total).toBeGreaterThan(2);
    // 本文に数字は無いので、ページに現れる数字は帯のものだけ。差し込みが壊れれば空になる。
    expect(await pageDigits(onBytes, 0)).toEqual(["1", String(total)]);
    expect(await pageDigits(onBytes, 1)).toEqual(["2", String(total)]);
    expect(await pageDigits(onBytes, total - 1)).toEqual([String(total), String(total)]);

    // 帯を切れば数字はどこにも描かれない。
    expect(await pageDigits(offBytes, 0)).toEqual([]);
    expect(await pageDigits(offBytes, total - 1)).toEqual([]);
  }, 120_000);

  it("warns when the bottom margin is smaller than the footer needs", async () => {
    const root = join(dir, "tight");
    await mkdir(root, { recursive: true });
    const configFile = join(root, "monodocs.config.yml");
    await writeFile(configFile, 'pdf:\n  bookmarks: false\n  margin:\n    bottom: "1mm"\n');
    const result = await buildSite({
      inputDir: docs,
      configFile,
      outputFile: join(root, "docs.pdf"),
      format: "pdf",
    });
    const warning = result.warnings.find((w) => w.message.includes("pdf.margin.bottom"));
    expect(warning).toBeDefined();
    // しきい値は測った高さ。決め打ちの数値ではないので、mm 表記が入る。
    expect(warning?.message).toMatch(/\d+\.\d+mm/);
  }, 120_000);

  it("stays silent when the margin fits, and for a replacement fragment", async () => {
    const roomy = join(dir, "roomy");
    await mkdir(roomy, { recursive: true });
    await writeFile(join(roomy, "monodocs.config.yml"), "pdf:\n  bookmarks: false\n");
    const fits = await buildSite({
      inputDir: docs,
      configFile: join(roomy, "monodocs.config.yml"),
      outputFile: join(roomy, "docs.pdf"),
      format: "pdf",
    });
    expect(fits.warnings.filter((w) => w.message.includes("pdf.margin.bottom"))).toHaveLength(0);

    // 置き換えフラグメントは検査しない。任意の HTML と CSS が収まるかは余白の値だけでは
    // 判断できず、判断したふりをすれば誤警告か、測定でしか守れない約束になる。
    const custom = join(dir, "custom-tight");
    await mkdir(custom, { recursive: true });
    await writeFile(
      join(custom, "monodocs.config.yml"),
      "pdf:\n  bookmarks: false\n  footer: '<div style=\"font-size:40pt\">x</div>'\n" +
        '  margin:\n    bottom: "1mm"\n',
    );
    const unchecked = await buildSite({
      inputDir: docs,
      configFile: join(custom, "monodocs.config.yml"),
      outputFile: join(custom, "docs.pdf"),
      format: "pdf",
    });
    expect(unchecked.warnings.filter((w) => w.message.includes("pdf.margin.bottom"))).toHaveLength(
      0,
    );
  }, 180_000);

  it("centres the default footer in the band", async () => {
    // 「下端中央」はロードマップと英日の設定リファレンスが述べている性質なので、実際に測る。
    // width:100% に左右 margin を足すと内容ボックスが帯からはみ出して右へずれる、という形で
    // 一度壊していた（実測で 15pt ぶん）。
    const puppeteer = (await import("puppeteer-core")).default;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromium as string,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent("<body style='margin:0'></body>", { waitUntil: "load" });
      const offset = await page.evaluate((fragment: string) => {
        // A4 の印字領域相当の帯に、Chromium が置くのと同じ形で入れる。
        const band = document.createElement("div");
        band.style.cssText = "position:absolute;left:0;top:0;width:595px";
        band.innerHTML = fragment;
        document.body.appendChild(band);
        const spans = band.querySelectorAll("span");
        const first = spans[0]!.getBoundingClientRect();
        const last = spans[spans.length - 1]!.getBoundingClientRect();
        const bandBox = band.getBoundingClientRect();
        const inner = band.firstElementChild!.getBoundingClientRect();
        const result = {
          textOffset: (first.left + last.right) / 2 - (bandBox.left + bandBox.width / 2),
          overflow: inner.right - bandBox.right,
        };
        band.remove();
        return result;
      }, DEFAULT_PDF_FOOTER);
      expect(Math.abs(offset.textOffset)).toBeLessThan(1);
      // 内容ボックスが帯をはみ出していないこと（はみ出しがずれの原因だった）。
      expect(offset.overflow).toBeLessThanOrEqual(0);
    } finally {
      await browser.close();
    }
  }, 60_000);

  it("measures the threshold without the document's own styles reaching it", async () => {
    // Chromium が描く帯は文書のスタイルを受けない。測る側が受けてしまうと、余裕のある余白で
    // 誤警告したり、狭い余白を見逃したりする。テーマの CSS を変えても閾値は動いてはいけない。
    async function thresholdWith(name: string, css: string): Promise<string> {
      const root = join(dir, name);
      const theme = join(root, "my-theme");
      await mkdir(theme, { recursive: true });
      await writeFile(join(theme, "style.css"), css);
      const configFile = join(root, "monodocs.config.yml");
      await writeFile(
        configFile,
        'pdf:\n  bookmarks: false\n  margin:\n    bottom: "1mm"\nhtml:\n  theme: "./my-theme"\n',
      );
      const result = await buildSite({
        inputDir: docs,
        configFile,
        outputFile: join(root, "docs.pdf"),
        format: "pdf",
      });
      const warning = result.warnings.find((w) => w.code === "pdf/margin-too-small");
      expect(warning, name).toBeDefined();
      // 最初の括弧は余白の値。閾値のほうを名指しで拾う。
      return /needs \(([\d.]+mm)\)/.exec(warning!.message)![1]!;
    }

    const plain = await thresholdWith("iso-plain", "/* nothing */");
    // 隔離できていなければ、これらは測定用の要素に直接一致して高さを押し上げる。
    const hostile = await thresholdWith(
      "iso-hostile",
      "div { padding: 40px !important; font-size: 60px !important; line-height: 4 !important; }\n" +
        "span { display: block !important; height: 120px !important; }\n" +
        "* { border-top: 20px solid red !important; }\n",
    );
    expect(hostile).toBe(plain);
    // 8pt の 1 行なので、数 mm のはず。決め打ちの 0 や 20mm ではないことも押さえる。
    expect(Number.parseFloat(plain)).toBeGreaterThan(1);
    expect(Number.parseFloat(plain)).toBeLessThan(10);
  }, 240_000);
});

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "./build";
import { loadConfig } from "./config";
import type { PageLike } from "./pipeline/browser";
import {
  describeFontCheck,
  FontCheckError,
  inspectFonts,
  runFontCheck,
  type FontCheckOutcome,
} from "./pipeline/fontCheck";
import { DEFAULT_PDF_FOOTER, DEFAULT_PDF_FOOTER_PROBE } from "./pipeline/pdfBands";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-fonts-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 検査結果を canned で返す偽ページ。ブラウザ無しで報告のしかたを検証する。 */
function fakePage(answer: unknown, options: { throws?: boolean } = {}) {
  const calls = { evaluated: 0, media: [] as string[] };
  const page: PageLike = {
    async setContent() {},
    async addScriptTag() {
      return undefined;
    },
    async evaluate() {
      calls.evaluated += 1;
      if (options.throws) throw new Error("evaluate failed");
      return JSON.stringify(answer);
    },
    async waitForFunction() {
      return undefined;
    },
    async emulateMediaType(type: string) {
      calls.media.push(type);
    },
    async pdf() {
      return new Uint8Array();
    },
  };
  return { page, calls };
}

describe("font check reporting", () => {
  it("names the clusters, their codepoints, and an example font", () => {
    const outcome: FontCheckOutcome = {
      status: "missing",
      clusters: ["日", "✅", "\u{103A0}"],
      truncated: false,
    };
    const message = describeFontCheck(outcome, "pdf")!;
    expect(message).toContain("日");
    expect(message).toContain("U+65E5");
    // 例に挙げるのはフォント名であってパッケージ名ではない（供給元は OS ごとに違う）。
    expect(message).toContain("Noto Sans CJK");
    expect(message).toContain("Noto Color Emoji");
    expect(message).toContain("U+103A0");
    expect(message).toContain("Noto Sans Old Persian");
    expect(message).not.toMatch(/apt|install fonts-|winget|choco/);
  });

  it("gives the pre-render finding its own wording", () => {
    const outcome: FontCheckOutcome = { status: "missing", clusters: ["日"], truncated: false };
    expect(describeFontCheck(outcome, "prerender")).toMatch(/pre-render/);
    expect(describeFontCheck(outcome, "pdf")).not.toMatch(/pre-render/);
  });

  it("counts what it did not list instead of dropping it silently", () => {
    const clusters = Array.from({ length: 12 }, (_, n) => String.fromCodePoint(0x103a0 + n));
    const message = describeFontCheck({ status: "missing", clusters, truncated: true }, "pdf")!;
    expect(message).toContain("12+");
    expect(message).toMatch(/4\+/);
  });

  it("says nothing when every cluster draws", () => {
    expect(describeFontCheck({ status: "ok" }, "pdf")).toBeUndefined();
    expect(describeFontCheck({ status: "ok", truncated: false }, "pdf")).toBeUndefined();
    // 測れなかったこと自体は報告しない。読者にできることが無い。
    expect(describeFontCheck({ status: "unmeasurable" }, "pdf")).toBeUndefined();
  });

  it("does not let a walk that was cut short read as a clean bill", () => {
    // 打ち切られた検査は通過した検査と同じ見た目になる。そこを黙ると、この機能が消したはずの
    // 「黙って成功する」に戻ってしまう。
    const message = describeFontCheck({ status: "ok", truncated: true }, "pdf");
    expect(message).toBeDefined();
    expect(message).toMatch(/\d/);
    expect(message).not.toMatch(/tofu/);
  });

  it("reports itself unusable rather than producing findings it cannot stand behind", () => {
    expect(describeFontCheck({ status: "unusable" }, "pdf")).toMatch(/private-use/);
  });
});

describe("runFontCheck", () => {
  it("warns by default and throws for error", async () => {
    const answer = { status: "missing", clusters: ["\u{103A0}"], truncated: false };

    const warned: string[] = [];
    const warn = fakePage(answer);
    await runFontCheck(warn.page, {
      mode: "warn",
      context: "pdf",
      onWarning: (m) => warned.push(m),
    });
    expect(warned).toHaveLength(1);

    const failing = fakePage(answer);
    await expect(
      runFontCheck(failing.page, { mode: "error", context: "pdf", onWarning: () => {} }),
    ).rejects.toBeInstanceOf(FontCheckError);
  });

  it("does not even measure when off", async () => {
    const { page, calls } = fakePage({ status: "missing", clusters: ["日"], truncated: false });
    await runFontCheck(page, { mode: "off", context: "pdf", onWarning: () => {} });
    expect(calls.evaluated).toBe(0);
  });

  it("keeps an unusable reference a warning even under error", async () => {
    // 基準が成り立たないのは所見ではなく、検査が答えを出さないということ。ビルドを止める理由にしない。
    const warned: string[] = [];
    const { page } = fakePage({ status: "unusable" });
    await runFontCheck(page, { mode: "error", context: "pdf", onWarning: (m) => warned.push(m) });
    expect(warned).toHaveLength(1);
  });

  it("stays silent when the page cannot be measured", async () => {
    const warned: string[] = [];
    const { page } = fakePage(undefined, { throws: true });
    await runFontCheck(page, { mode: "warn", context: "pdf", onWarning: (m) => warned.push(m) });
    expect(warned).toEqual([]);
    expect(await inspectFonts(page)).toEqual({ status: "unmeasurable" });
  });

  it("measures print media for the PDF, and leaves the pre-render page alone", async () => {
    const pdf = fakePage({ status: "ok" });
    await runFontCheck(pdf.page, { mode: "warn", context: "pdf", onWarning: () => {} });
    expect(pdf.calls.media).toEqual(["print"]);

    const prerender = fakePage({ status: "ok" });
    await runFontCheck(prerender.page, {
      mode: "warn",
      context: "prerender",
      onWarning: () => {},
    });
    expect(prerender.calls.media).toEqual([]);
  });
});

describe("fontCheck configuration", () => {
  it("defaults to warn", async () => {
    const root = join(dir, "cfg-default");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "monodocs.config.yml"), "title: T\n");
    const config = await loadConfig({ configFile: join(root, "monodocs.config.yml") }, root);
    expect(config.fontCheck).toBe("warn");
  });

  it("takes warn / error / off and rejects anything else", async () => {
    const root = join(dir, "cfg-values");
    await mkdir(root, { recursive: true });
    for (const value of ["warn", "error", "off"]) {
      const file = join(root, `${value}.yml`);
      await writeFile(file, `fontCheck: "${value}"\n`);
      expect((await loadConfig({ configFile: file }, root)).fontCheck).toBe(value);
    }
    const bad = join(root, "bad.yml");
    await writeFile(bad, 'fontCheck: "yes"\n');
    await expect(loadConfig({ configFile: bad }, root)).rejects.toThrow(/fontCheck/);
  });
});

describe("the default footer probe", () => {
  it("carries the digits Chromium injects, derived from the fragment itself", () => {
    // 空の span では測る文字が無い。数字を別の場所に書き写さないよう、定数から導出する。
    expect(DEFAULT_PDF_FOOTER).toContain('<span class="pageNumber"></span>');
    expect(DEFAULT_PDF_FOOTER_PROBE).toContain('<span class="pageNumber">0123456789</span>');
    expect(DEFAULT_PDF_FOOTER_PROBE).toContain('<span class="totalPages">0123456789</span>');
    expect(DEFAULT_PDF_FOOTER_PROBE.replace(/>0123456789</g, "><")).toBe(DEFAULT_PDF_FOOTER);
  });
});

// 実際に描けるかどうかは Chromium にしか答えられない。
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

/** 開発イメージが描けない文字（ロードマップ 24.3.3 の計測と同じもの）。 */
const OLD_PERSIAN = "\u{103A0}";

async function buildPdf(
  name: string,
  page: string,
  config = "",
): Promise<{ warnings: string[] } | Error> {
  const root = join(dir, name);
  const docs = join(root, "docs");
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "index.md"), page);
  const configFile = join(root, "monodocs.config.yml");
  await writeFile(configFile, `pdf:\n  bookmarks: false\n${config}`);
  try {
    return await buildSite({
      inputDir: docs,
      configFile,
      outputFile: join(root, "docs.pdf"),
      format: "pdf",
    });
  } catch (error) {
    return error as Error;
  }
}

/**
 * ビルドが成功したことを確かめたうえで、フォント検査由来の警告だけを取り出す。
 *
 * 失敗したビルドを黙って「警告なし」と読むと沈黙の検証が素通りする。所見の文言だけで絞るのも
 * 同じ穴を作る（基準が不成立・打ち切りの警告が出ていても「静かだった」と読めてしまう）ので、
 * この検査が出しうる 3 通りをカタログから組み立てて照合する。
 */
function fontWarnings(result: { warnings: string[] } | Error): string[] {
  expect(result).not.toBeInstanceOf(Error);
  const marks = [
    describeFontCheck({ status: "missing", clusters: ["x"], truncated: false }, "pdf")!,
    describeFontCheck({ status: "missing", clusters: ["x"], truncated: false }, "prerender")!,
    describeFontCheck({ status: "unusable" }, "pdf")!,
    describeFontCheck({ status: "ok", truncated: true }, "pdf")!,
  ].map((message) => message.slice(0, 30));
  return (result as { warnings: string[] }).warnings.filter((w) =>
    marks.some((mark) => w.startsWith(mark)),
  );
}

describe.skipIf(!chromium)("font check（実 Chromium）", () => {
  it("stays silent for a document this machine can draw", async () => {
    // 開発イメージは fonts-liberation / fonts-noto-cjk / fonts-noto-color-emoji を持つ。
    // ここが鳴るなら、それは誤検出そのもの。
    const result = await buildPdf("real-ok", "# Home\n\nPlain text, 日本語, ✅ emoji.\n");
    expect(fontWarnings(result)).toEqual([]);
    // この文書はほかに警告の出る要素を持たない。全体が空であることまで見ておくと、
    // 別種の警告が紛れ込んだときにここで気づける。
    expect((result as { warnings: string[] }).warnings).toEqual([]);
  }, 120_000);

  it("warns, naming the character and a font that covers it", async () => {
    const result = await buildPdf("real-missing", `# Home\n\nOld Persian: ${OLD_PERSIAN}\n`);
    const warning = fontWarnings(result)[0];
    expect(warning).toBeDefined();
    expect(warning).toContain("U+103A0");
    expect(warning).toContain("Noto Sans Old Persian");
  }, 120_000);

  it("fails the build for error, and says nothing for off", async () => {
    const failed = await buildPdf(
      "real-error",
      `# Home\n\n${OLD_PERSIAN}\n`,
      'fontCheck: "error"\n',
    );
    expect(failed).toBeInstanceOf(Error);
    expect((failed as Error).message).toContain("U+103A0");
    // 豆腐入りの PDF は書き出さない。
    expect(existsSync(join(dir, "real-error", "docs.pdf"))).toBe(false);

    const off = await buildPdf("real-off", `# Home\n\n${OLD_PERSIAN}\n`, 'fontCheck: "off"\n');
    expect(fontWarnings(off)).toEqual([]);
    expect(existsSync(join(dir, "real-off", "docs.pdf"))).toBe(true);
  }, 180_000);

  it("measures nothing under a root that draws nothing", async () => {
    // TreeWalker はルートにフィルタを掛けず、display は継承しない（display:none の子要素も
    // block と計算される）。ここを見落とすと、何も描かないルートの下を丸ごと測ってしまう。
    const theme = join(dir, "real-roothidden", "my-theme");
    await mkdir(theme, { recursive: true });
    await writeFile(join(theme, "style.css"), "@media print { html { display: none } }\n");
    const result = await buildPdf(
      "real-roothidden",
      `# Home\n\n${OLD_PERSIAN}\n`,
      'html:\n  theme: "./my-theme"\n',
    );
    expect(fontWarnings(result)).toEqual([]);
  }, 120_000);

  it("ignores what print does not put on the paper", async () => {
    // サイドバーと目次は印刷されない。そこにしか無い文字で警告を出すのは誤検出になる。
    const result = await buildPdf(
      "real-chrome",
      "# Home\n\n## Section\n\nPlain text.\n",
      `html:\n  labels:\n    tocTitle: "${OLD_PERSIAN}"\n    searchResults: "${OLD_PERSIAN}"\n`,
    );
    expect(fontWarnings(result)).toEqual([]);
  }, 120_000);

  it("catches a diagram that mermaid pre-render would bake the tofu into", async () => {
    const root = join(dir, "real-mermaid");
    const docs = join(root, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(
      join(docs, "index.md"),
      `# Diagram\n\n\`\`\`mermaid\ngraph TD\n  A["${OLD_PERSIAN}"] --> B[ok]\n\`\`\`\n`,
    );
    const configFile = join(root, "monodocs.config.yml");
    await writeFile(configFile, "mermaid:\n  mode: pre-render\n");
    const result = await buildSite({
      inputDir: docs,
      configFile,
      outputFile: join(root, "docs.html"),
    });
    const warning = result.warnings.find((w) => /tofu/.test(w));
    expect(warning).toBeDefined();
    expect(warning).toMatch(/pre-render/);
    expect(warning).toContain("U+103A0");
  }, 180_000);
});

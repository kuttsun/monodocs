import { existsSync } from "node:fs";
import type { ColorScheme } from "../config.js";
import { loadMermaidInline } from "../themes/mermaid.js";

/**
 * ビルド時に Mermaid 図を SVG 文字列へ変換するレンダラ。
 * `render` は `<svg>…</svg>` を返す。テストでは偽実装を注入して Chromium なしで検証する。
 */
export interface MermaidPrerenderer {
  /** `id` は生成 SVG のルート id（CSS/SVG セーフ・全 HTML で一意であること）。 */
  render(id: string, code: string): Promise<string>;
  close(): Promise<void>;
}

/**
 * pre-render の **環境／セットアップ**エラー（puppeteer-core 不在・Chromium 不在・
 * ブラウザ起動失敗）。図単位の描画エラー（構文エラー等）と区別するための型。
 * これはビルドを止める（fail fast）。図単位の描画エラーは警告＋ソース表示にフォールバックする。
 */
export class MermaidPrerenderSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MermaidPrerenderSetupError";
  }
}

/** Chromium の実行パス候補（`PUPPETEER_EXECUTABLE_PATH` が無いとき順に探索）。 */
const CHROMIUM_CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
];

function resolveChromiumPath(): string {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv) return fromEnv;
  const found = CHROMIUM_CANDIDATES.find((p) => existsSync(p));
  if (found) return found;
  throw new MermaidPrerenderSetupError(
    "mermaid.mode: pre-render には Chromium が必要です。PUPPETEER_EXECUTABLE_PATH を設定するか、" +
      "Chromium をインストールしてください（開発用 Docker では Dockerfile.dev を参照）。",
  );
}

// ページ内で mermaid 名前空間を解決するヘルパ本体。inline runtime（themes/mermaid.ts）と
// 同じ順序（__esbuild_esm_mermaid_nm → .mermaid → window.mermaid）で取り出す。
const RESOLVE_MERMAID =
  "var ns=window.__esbuild_esm_mermaid_nm;var m=ns&&ns.mermaid;m=m&&(m.default||m);" +
  "if(!m&&window.mermaid)m=window.mermaid;";

// puppeteer-core は optionalDependency のため、型に依存せず最小 shape で扱う。
interface PageLike {
  setContent(html: string): Promise<void>;
  addScriptTag(opts: { content: string }): Promise<unknown>;
  evaluate(fn: string): Promise<unknown>;
}
interface BrowserLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}
interface PuppeteerLike {
  launch(opts: { headless: boolean; executablePath: string; args: string[] }): Promise<BrowserLike>;
}

function mermaidThemeFor(colorScheme: ColorScheme): "dark" | "default" {
  // pre-render はビルド時にテーマを固定する。auto は light（default）に倒す。
  return colorScheme === "dark" ? "dark" : "default";
}

/**
 * Puppeteer + 同梱 mermaid で SVG を生成するプリレンダラを作る。
 * ブラウザは最初の {@link MermaidPrerenderer.render} 呼び出し時に **lazy 起動**する
 * （図が 0 個なら Chromium を起動しない）。`puppeteer-core` / Chromium 不在時は
 * 実行可能なエラー文言を投げる。
 */
export function createPuppeteerPrerenderer(options: {
  colorScheme: ColorScheme;
}): MermaidPrerenderer {
  const theme = mermaidThemeFor(options.colorScheme);
  let browser: BrowserLike | undefined;
  let page: PageLike | undefined;

  async function ensurePage(): Promise<PageLike> {
    if (page) return page;
    let mod: unknown;
    try {
      mod = await import("puppeteer-core");
    } catch {
      throw new MermaidPrerenderSetupError(
        "mermaid.mode: pre-render には puppeteer-core が必要です。`pnpm add puppeteer-core` で" +
          "追加してください（node_modules を同梱しないバンドル版 CLI＝単一 .cjs / 単一実行ファイル" +
          "では pre-render は利用できません。パッケージインストール版を使ってください）。",
      );
    }
    const puppeteer = ((mod as { default?: PuppeteerLike }).default ??
      (mod as PuppeteerLike)) as PuppeteerLike;
    // resolveChromiumPath は MermaidPrerenderSetupError を投げる（try の外で fail fast）。
    const executablePath = resolveChromiumPath();
    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath,
        // Docker/CI では root 実行のため sandbox を無効化する（信頼できる入力前提）。
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const p = await browser.newPage();
      await p.setContent("<!doctype html><html><body></body></html>");
      await p.addScriptTag({ content: await loadMermaidInline() });
      await p.evaluate(
        `(function(){${RESOLVE_MERMAID}window.__sdMermaid=m;m.initialize({startOnLoad:false,theme:${JSON.stringify(
          theme,
        )}});})()`,
      );
      page = p;
      return p;
    } catch (error) {
      // 起動・初期化の失敗も環境エラー扱い（fail fast）。
      throw new MermaidPrerenderSetupError(
        `mermaid.mode: pre-render のブラウザ初期化に失敗しました: ${(error as Error).message}`,
      );
    }
  }

  return {
    async render(id, code) {
      const p = await ensurePage();
      const svg = await p.evaluate(
        `(async function(){var r=await window.__sdMermaid.render(${JSON.stringify(
          id,
        )},${JSON.stringify(code)});return r.svg;})()`,
      );
      return String(svg);
    },
    async close() {
      if (browser) {
        await browser.close();
        browser = undefined;
        page = undefined;
      }
    },
  };
}

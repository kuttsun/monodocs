import type { ColorScheme } from "../config.js";
import { loadMermaidInline } from "../themes/mermaid.js";
import { BrowserSetupError, launchBrowser, type BrowserLike, type PageLike } from "./browser.js";

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
 * Mermaid pre-render の**環境／セットアップ**エラー（Chromium / puppeteer-core 不在・
 * ブラウザ初期化失敗）。図単位の描画エラー（構文エラー等）と区別するための型。
 * {@link BrowserSetupError} を継承し、これはビルドを止める（fail fast）。図単位の描画エラーは
 * 警告＋ソース表示にフォールバックする。
 */
export class MermaidPrerenderSetupError extends BrowserSetupError {
  constructor(message: string) {
    super(message);
    this.name = "MermaidPrerenderSetupError";
  }
}

// ページ内で mermaid 名前空間を解決するヘルパ本体。inline runtime（themes/mermaid.ts）と
// 同じ順序（__esbuild_esm_mermaid_nm → .mermaid → window.mermaid）で取り出す。
const RESOLVE_MERMAID =
  "var ns=window.__esbuild_esm_mermaid_nm;var m=ns&&ns.mermaid;m=m&&(m.default||m);" +
  "if(!m&&window.mermaid)m=window.mermaid;";

function mermaidThemeFor(colorScheme: ColorScheme): "dark" | "default" {
  // pre-render はビルド時にテーマを固定する。auto は light（default）に倒す。
  return colorScheme === "dark" ? "dark" : "default";
}

/**
 * Puppeteer + 同梱 mermaid で SVG を生成するプリレンダラを作る。
 * ブラウザは最初の {@link MermaidPrerenderer.render} 呼び出し時に **lazy 起動**する
 * （図が 0 個なら Chromium を起動しない）。`puppeteer-core` / Chromium 不在時は
 * {@link MermaidPrerenderSetupError}（＝ {@link BrowserSetupError}）を投げる。
 */
export function createPuppeteerPrerenderer(options: {
  colorScheme: ColorScheme;
}): MermaidPrerenderer {
  const theme = mermaidThemeFor(options.colorScheme);
  let browser: BrowserLike | undefined;
  let page: PageLike | undefined;

  async function ensurePage(): Promise<PageLike> {
    if (page) return page;
    try {
      // launchBrowser は BrowserSetupError を投げる（puppeteer-core / Chromium 不在・起動失敗）。
      browser = await launchBrowser();
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
      // 起動・ページ初期化の失敗はすべて MermaidPrerenderSetupError 型に揃える（fail fast）。
      // launchBrowser の BrowserSetupError は実行可能な文言を持つのでそのまま活かす。
      if (error instanceof MermaidPrerenderSetupError) throw error;
      throw new MermaidPrerenderSetupError(
        error instanceof BrowserSetupError
          ? error.message
          : `mermaid.mode: pre-render のブラウザ初期化に失敗しました: ${(error as Error).message}`,
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

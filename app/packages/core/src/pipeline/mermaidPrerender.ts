import type { ColorScheme } from "../config.js";
import type { Diagnostic } from "../diagnostics.js";
import {
  MATH_FONT_RULE,
  assertMathFontLoaded,
  mermaidHasFormula,
  withMathFont,
} from "../themes/mathFont.js";
import { loadMermaidInline } from "../themes/mermaid.js";
import { BrowserSetupError, launchBrowser, type BrowserLike, type PageLike } from "./browser.js";
import { runFontCheck, type FontCheckMode } from "./fontCheck.js";
import { t } from "../messages.js";

/**
 * ビルド時に Mermaid 図を SVG 文字列へ変換するレンダラ。
 * `render` は `<svg>…</svg>` を返す。テストでは偽実装を注入して Chromium なしで検証する。
 */
export interface MermaidPrerenderer {
  /** `id` は生成 SVG のルート id（CSS/SVG セーフ・全 HTML で一意であること）。 */
  render(id: string, code: string): Promise<string>;
  /**
   * 図が必要とするフォントがこのマシンに揃っていたかを、**図を描いた文脈そのもの**で確かめる
   * （{@link file://./fontCheck.ts}）。完成 HTML の側で測り直しても、その SVG を生んだフォント
   * 解決は再現できない。実装は任意（テストの偽レンダラは持たない）。
   */
  checkFonts?(options: {
    mode: FontCheckMode;
    onWarning: (diagnostic: Diagnostic) => void;
  }): Promise<void>;
  /**
   * The SVGs drawn again for the PDF, in the carried math font, keyed by the SVG {@link render}
   * returned for the HTML: one for each diagram with a formula in a label, when the build asked for
   * them. Optional (the tests' fake renderer has none).
   */
  pdfVariants?(): ReadonlyMap<string, string>;
  close(): Promise<void>;
}

/**
 * Where the carried math font goes in a pre-render (roadmap 6.4, v0.17). A label's box is laid out
 * at build time against the font it will be drawn in, so the HTML, which a reader's browser draws in
 * the reader's fonts, keeps the machine's layout, and the PDF gets its own:
 *
 * - `only`: no HTML is written, so a diagram with a formula in a label is laid out in the carried
 *   font, once;
 * - `variant`: the HTML's SVG is laid out as before, and a diagram with a formula in a label is laid
 *   out a second time, in the carried font, for the PDF ({@link MermaidPrerenderer.pdfVariants}).
 */
export type PrerenderMathFont = { head: () => Promise<string>; mode: "only" | "variant" };

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

// pre-render fixes the theme at build time, and auto falls back to light. Light names no theme, so
// each diagram gets mermaid 12's own default (the redux-color look) exactly as the client runtime,
// which names none, does; naming "default" would bring back mermaid 11's look. Dark takes that
// look's dark counterpart.
function mermaidThemeFor(colorScheme: ColorScheme): "redux-dark-color" | undefined {
  return colorScheme === "dark" ? "redux-dark-color" : undefined;
}

/**
 * Puppeteer + 同梱 mermaid で SVG を生成するプリレンダラを作る。
 * ブラウザは最初の {@link MermaidPrerenderer.render} 呼び出し時に **lazy 起動**する
 * （図が 0 個なら Chromium を起動しない）。`puppeteer-core` / Chromium 不在時は
 * {@link MermaidPrerenderSetupError}（＝ {@link BrowserSetupError}）を投げる。
 */
export function createPuppeteerPrerenderer(options: {
  colorScheme: ColorScheme;
  mathFont?: PrerenderMathFont;
}): MermaidPrerenderer {
  const theme = mermaidThemeFor(options.colorScheme);
  const mathFont = options.mathFont;
  let browser: BrowserLike | undefined;
  // The page that draws in the machine's fonts, and the one that draws in the carried math font:
  // each opened for the first diagram that needs it, so a document with no formula never reads the
  // font.
  let page: PageLike | undefined;
  let carriedPage: PageLike | undefined;
  const variants = new Map<string, string>();
  // 生成した SVG を保持し、フォント検査でこのページへ差し戻して測る。図の文字がどのフォントへ
  // 解決されるかを決めるのは SVG 自身が持つ <style> なので、それを描いたページの中で測れば
  // 同じ解決を再現できる。PDF のためだけの写しは HTML 用と同じ文字なので測らない。
  const rendered: string[] = [];
  const renderedCarried: string[] = [];

  async function openPage(carried: boolean): Promise<PageLike> {
    try {
      // launchBrowser は BrowserSetupError を投げる（puppeteer-core / Chromium 不在・起動失敗）。
      browser ??= await launchBrowser();
      const p = await browser.newPage();
      const blank = "<!doctype html><html><head></head><body></body></html>";
      // Before mermaid measures anything against it.
      const head = carried && mathFont ? await mathFont.head() : undefined;
      await p.setContent(head ? withMathFont(blank, head) : blank);
      if (head) await assertMathFontLoaded(p);
      await p.addScriptTag({ content: await loadMermaidInline() });
      await p.evaluate(
        `(function(){${RESOLVE_MERMAID}window.__sdMermaid=m;m.initialize(${JSON.stringify({
          startOnLoad: false,
          ...(theme ? { theme } : {}),
        })});})()`,
      );
      return p;
    } catch (error) {
      // 起動・ページ初期化の失敗はすべて MermaidPrerenderSetupError 型に揃える（fail fast）。
      // launchBrowser の BrowserSetupError は実行可能な文言を持つのでそのまま活かす。
      if (error instanceof MermaidPrerenderSetupError) throw error;
      throw new MermaidPrerenderSetupError(
        error instanceof BrowserSetupError
          ? error.message
          : t("mermaid.browserInitFailed", { detail: (error as Error).message }),
      );
    }
  }

  async function draw(p: PageLike, id: string, code: string): Promise<string> {
    const svg = await p.evaluate(
      `(async function(){var r=await window.__sdMermaid.render(${JSON.stringify(
        id,
      )},${JSON.stringify(code)});return r.svg;})()`,
    );
    return String(svg);
  }

  return {
    async render(id, code) {
      const formula = mathFont !== undefined && mermaidHasFormula(code);
      if (formula && mathFont.mode === "only") {
        // No HTML is written: the PDF's copy is the only one.
        carriedPage ??= await openPage(true);
        const svg = await draw(carriedPage, id, code);
        renderedCarried.push(svg);
        return svg;
      }
      page ??= await openPage(false);
      const svg = await draw(page, id, code);
      rendered.push(svg);
      if (formula) {
        carriedPage ??= await openPage(true);
        // The same source drew once already. Should the second draw fail, it fails as the first
        // would, rather than leave the PDF a label laid out for other fonts without a word.
        variants.set(svg, await draw(carriedPage, id, code));
      }
      return svg;
    },
    pdfVariants() {
      return variants;
    },
    async checkFonts({ mode, onWarning }) {
      // 図が 1 つも無ければブラウザすら起動していない。測る対象も無い。
      if (mode === "off") return;
      if (page !== undefined && rendered.length > 0) {
        await runFontCheck(page, { mode, context: "prerender", onWarning, probes: rendered });
      }
      // The probes are measured in a shadow tree, which the page's rule does not reach.
      if (carriedPage !== undefined && renderedCarried.length > 0) {
        await runFontCheck(carriedPage, {
          mode,
          context: "prerender-pdf",
          onWarning,
          probes: renderedCarried.map((svg) => MATH_FONT_RULE + svg),
        });
      }
    },
    async close() {
      if (browser) {
        await browser.close();
        browser = undefined;
        page = undefined;
        carriedPage = undefined;
      }
    },
  };
}

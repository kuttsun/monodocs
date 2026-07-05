import type { PdfMargin } from "../config.js";
import { BrowserSetupError, launchBrowser, type BrowserLike, type PageLike } from "./browser.js";
import { addOutline, collectDests, remapDests, type PdfOutlineNode } from "./pdfOutline.js";

/** {@link PdfGenerator.render} のオプション。 */
export type PdfRenderOptions = {
  /** 用紙サイズ（Puppeteer の page.pdf `format`。"A4" / "Letter" など）。 */
  pageSize: string;
  /** ページ余白（各辺 CSS 長さ）。 */
  margin: PdfMargin;
  /** 背景色・背景画像を印刷するか。 */
  printBackground: boolean;
  /**
   * client mode の Mermaid を含むか。true のとき、全ページを表示状態にして各図の描画完了を
   * 待ってから PDF 化する（pre-render 済み／図なしのときは false）。
   */
  waitForMermaid: boolean;
  /**
   * PDF のしおり（HTML サイドバーと同じ フォルダ→ページ 構造）。指定時は各ページ位置へ内部
   * リンクを注入して Chromium に名前付き宛先を作らせ、生成後に {@link addOutline} で付与する。
   * 未指定・空ならしおりを作らない。
   */
  outline?: PdfOutlineNode[];
};

// 各ページ dest（`page-{id}`）位置へ ASCII サロゲート id のアンカーを差し込み、それへの内部
// リンクを隠しコンテナに置く。Chromium は内部リンク先を catalog `/Dests` に登録するので、
// Unicode の page id に依存せず ASCII キー（mdpdf-N）で宛先を引けるようにする。
function surrogatePrefix(): string {
  return "mdpdf-";
}
function injectSurrogatesScript(destIds: string[]): string {
  return (
    `(function(){var ids=${JSON.stringify(destIds)};var pre=${JSON.stringify(surrogatePrefix())};` +
    `var box=document.createElement('div');box.style.cssText='position:absolute;width:0;height:0;overflow:hidden';` +
    `for(var n=0;n<ids.length;n++){var key=pre+n;var t=document.getElementById(ids[n]);` +
    `if(t){var a=document.createElement('a');a.id=key;t.insertBefore(a,t.firstChild);}` +
    `var l=document.createElement('a');l.href='#'+key;box.appendChild(l);}` +
    `document.body.appendChild(box);})()`
  );
}

/**
 * 単一 HTML を PDF（バイト列）へ変換するジェネレータ。
 * {@link file://./mermaidPrerender.ts MermaidPrerenderer} と同じく、テストでは偽実装を注入して
 * Chromium なしで検証する。ブラウザは最初の {@link render} 呼び出しで lazy 起動する。
 */
export interface PdfGenerator {
  render(html: string, options: PdfRenderOptions): Promise<Uint8Array>;
  close(): Promise<void>;
}

// 全ページの hidden 属性を外して印刷レイアウトへ寄せ、client Mermaid があれば全ページ分を
// 描画する。__sdRenderMermaid は表示中（:not([hidden])）ページのみ描画するため、先に hidden を
// 外してから呼ぶ。単一 HTML では非表示ページは display:none で幅が取れず図が壊れるため、
// この「全ページ展開 → 描画」を PDF 側で行う（themes/mermaid.ts の設計コメント参照）。
const PREPARE_MERMAID =
  "document.querySelectorAll('.page[hidden]').forEach(function(el){el.removeAttribute('hidden');});" +
  "if(typeof window.__sdRenderMermaid==='function')window.__sdRenderMermaid();";

// すべての .mermaid が描画完了（mermaid が付ける data-processed="true"、もしくは <svg> を内包）
// したか。図が 0 個なら every は true で即座に解決する。
const MERMAID_DONE =
  "Array.prototype.every.call(document.querySelectorAll('.mermaid'),function(el){" +
  "return el.getAttribute('data-processed')==='true'||!!el.querySelector('svg');})";

/** client Mermaid の描画完了を待つ上限（超えても PDF 生成は続行する）。 */
const MERMAID_WAIT_TIMEOUT_MS = 30_000;

// 本文中のページ間リンクは SPA 用の hash route（`#/route`）になっている。PDF には `/route`
// という id の要素が無いため Chromium はリンク注釈を作れず、クリックしても飛べない。そこで
// 各 article の data-route → 要素 id（`page-{id}`）対応を作り、`#/route` を `#page-{id}` へ
// 書き換えて、PDF 内で有効な内部リンク（GoTo）にする。`#見出しID` などのアンカーは対象外。
const REWRITE_ROUTE_LINKS =
  "(function(){var m={};" +
  "document.querySelectorAll('#content article[data-route]').forEach(function(a){if(a.id)m[a.getAttribute('data-route')]=a.id;});" +
  "document.querySelectorAll('a[href]').forEach(function(link){var h=link.getAttribute('href');" +
  "if(!h||h.charAt(0)!=='#')return;var frag=h.slice(1);if(frag.charAt(0)!=='/')return;" +
  "var r;try{r=decodeURI(frag);}catch(e){r=frag;}var id=m[r]||m[frag];" +
  "if(id)link.setAttribute('href','#'+id);});})()";

/**
 * Puppeteer で単一 HTML を PDF 化するジェネレータを作る。
 * `page.pdf()` は既定で print メディアをエミュレートするため、テーマの `@media print`
 * （全ページ縦展開・サイドバー/目次/ツールバー非表示）がそのまま適用される。
 * 画像は data URI で自己完結しているためネットワークは不要。`puppeteer-core` / Chromium
 * 不在時は {@link BrowserSetupError} を投げる（fail fast）。
 */
export function createPuppeteerPdfGenerator(): PdfGenerator {
  let browser: BrowserLike | undefined;

  async function ensureBrowser(): Promise<BrowserLike> {
    if (!browser) browser = await launchBrowser();
    return browser;
  }

  return {
    async render(html, options) {
      const b = await ensureBrowser();
      let page: PageLike;
      try {
        page = await b.newPage();
        // 画像は data URI 済みなので "load" で十分（ネットワーク待ちは不要）。
        await page.setContent(html, { waitUntil: "load" });
      } catch (error) {
        throw new BrowserSetupError(
          `PDF 用ページの読み込みに失敗しました: ${(error as Error).message}`,
        );
      }

      if (options.waitForMermaid) {
        await page.evaluate(`(function(){${PREPARE_MERMAID}})()`);
        try {
          await page.waitForFunction(`(function(){return ${MERMAID_DONE};})()`, {
            timeout: MERMAID_WAIT_TIMEOUT_MS,
          });
        } catch {
          // 描画が完了しなくても PDF 生成は続行する（cdn runtime でネットワーク不通の場合など。
          // 当該図はソース表示のまま出力される）。
        }
      }

      // 本文のページ間リンク（hash route）を PDF 内で有効な内部リンクへ書き換える。
      await page.evaluate(REWRITE_ROUTE_LINKS);

      // しおり用に、各ページ位置へ ASCII サロゲート宛先を注入する（page.pdf 前に必要）。
      const destIds = options.outline ? collectDests(options.outline) : [];
      const surrogate = new Map<string, string>();
      if (destIds.length > 0) {
        destIds.forEach((id, n) => surrogate.set(id, `${surrogatePrefix()}${n}`));
        await page.evaluate(injectSurrogatesScript(destIds));
      }

      const pdf = await page.pdf({
        format: options.pageSize,
        margin: options.margin,
        printBackground: options.printBackground,
      });

      // 生成後に HTML サイドバーと同じ フォルダ→ページ 構造のしおりを付与する。
      if (options.outline && destIds.length > 0) {
        return addOutline(pdf, remapDests(options.outline, surrogate));
      }
      return pdf;
    },
    async close() {
      if (browser) {
        await browser.close();
        browser = undefined;
      }
    },
  };
}

import type { PdfMargin } from "../config.js";
import { BrowserSetupError, launchBrowser, type BrowserLike, type PageLike } from "./browser.js";
import { runFontCheck, type FontCheckMode } from "./fontCheck.js";
import { DEFAULT_PDF_FOOTER, DEFAULT_PDF_FOOTER_PROBE, EMPTY_PDF_BAND } from "./pdfBands.js";
import { addOutline, collectDests, remapDests, type PdfOutlineNode } from "./pdfOutline.js";
import { setPdfMetadata } from "./pdfMetadata.js";
import { t } from "../messages.js";

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
  /** 文書タイトル（PDF の Title）。 */
  title?: string;
  /** 生成ツール名（PDF の Creator / Producer）。 */
  generator?: string;
  /** ページ上部の帯（HTML フラグメント）。未指定は帯なし扱い。 */
  header?: string;
  /** ページ下部の帯（同上）。未指定は帯なし扱い。 */
  footer?: string;
  /**
   * 版面に必要なフォントがこのマシンに揃っているかの検査。未指定は検査しない（偽ジェネレータを
   * 注入するテスト経路のため）。`error` のときは {@link file://./fontCheck.ts FontCheckError}
   * を投げ、豆腐入りの PDF を書き出させない。
   */
  fontCheck?: FontCheckMode;
  /** 余白・フォントの検査で問題が出たときの通知先。ビルドの警告へ流す。 */
  onWarning?: (message: string) => void;
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
 * 既定フッタの描画高さと、下余白の実寸を同じブラウザで測るスクリプト。
 *
 * しきい値を数値で決め打ちにしない。フラグメントを書き換えたときに古い数値が残って警告が
 * ずれるのを避けるため、そのフラグメント自身の高さを測る。余白のほうもブラウザに測らせるのは、
 * mm / in / pt / cm / px を自前で換算する表を持たずに済ませるため（換算表は必ず古くなる）。
 *
 * Chromium が実際に描く帯は文書のスタイルを受けないので、測る側も受けてはいけない。ここは
 * **shadow root の中**で測る。文書のスタイルシートは shadow tree の要素に一致しないため、
 * `div { padding: … }` のようなテーマ側の規則が測定値に混ざらない。境界を越えるのは継承だけで、
 * それは中の包み要素の `all: initial` が断ち切る。本文へ直接挿して `all: initial` を付けるだけ
 * では足りない。それは自分自身にしか効かず、フラグメント内の `div` / `span` には文書側の
 * セレクタが直接一致してしまう。
 */
function measureFooterFitScript(fragment: string, bottomMargin: string): string {
  // 余白の値は設定ファイル由来なので、cssText へ連結せず setProperty で 1 宣言として渡す。
  // 連結すると `10mm;…` のような値が宣言をもう一つ足せてしまい、測る対象が変えられる。
  // 解釈できない値は無視されて高さ 0 になり、下の Number.isFinite / 比較で警告は出ない。
  return (
    `(function(){` +
    `var host=document.createElement('div');` +
    // ホストは shadow tree の外、つまり本文の中にある。文書側の規則がここに当たれば、
    // 中で測った寸法ごと歪む（display:none なら 0、transform なら倍率つき）。inline の
    // !important は作者スタイルシートの !important にも勝つので、効く形で押さえておく。
    `[['display','block'],['position','absolute'],['left','-9999px'],['top','0'],` +
    `['width','800px'],['height','auto'],['margin','0'],['padding','0'],['border','0'],` +
    `['min-width','0'],['min-height','0'],['max-width','none'],['max-height','none'],` +
    `['transform','none'],['scale','none'],['zoom','1'],['contain','none'],` +
    `['visibility','visible'],['opacity','1'],['filter','none']]` +
    `.forEach(function(d){host.style.setProperty(d[0],d[1],'important');});` +
    `document.body.appendChild(host);` +
    // 早期 return でも測定用の要素を本文へ残さない。残せば PDF の版面に入り込みうる。
    `try{` +
    `if(!host.attachShadow)return JSON.stringify({});` +
    `var root=host.attachShadow({mode:'open'});` +
    // 継承だけは境界を越えるので、包みで断ち切る。display は all:initial が inline へ戻す。
    `var wrap=document.createElement('div');` +
    `wrap.style.cssText='all:initial;display:block;width:800px';` +
    `root.appendChild(wrap);` +
    `var probe=document.createElement('div');` +
    `probe.style.setProperty('height',${JSON.stringify(bottomMargin)});` +
    `wrap.appendChild(probe);` +
    `var marginPx=probe.getBoundingClientRect().height;` +
    `probe.remove();` +
    `var box=document.createElement('div');` +
    `box.innerHTML=${JSON.stringify(fragment)};` +
    `wrap.appendChild(box);` +
    `var bandPx=box.getBoundingClientRect().height;` +
    `return JSON.stringify({marginPx:marginPx,bandPx:bandPx});` +
    `}finally{host.remove();}})()`
  );
}

/** px を紙の単位へ。CSS の 1in = 96px = 25.4mm。 */
function pxToMm(px: number): string {
  return `${((px / 96) * 25.4).toFixed(1)}mm`;
}

/**
 * 下余白が既定フッタを収めるか確かめ、収まらなければ警告する。
 *
 * 置き換えフラグメントは対象にしない。任意の HTML と CSS が余白に収まるかは余白の値だけでは
 * 判断できず、判断したふりをすれば誤警告か、測定でしか守れない約束のどちらかになる。
 *
 * 測定によれば、Chromium 組み込みのテンプレートは 10mm と 5mm の間で描画されなくなるが、
 * 渡されたフラグメント（monodocs が使うのはこちら）は 0mm でも描かれ続ける。つまり失敗の形は
 * 「フッタが消える」ではなく「フッタが紙の端に貼りつく」なので、黙って壊れる。
 */
async function warnIfFooterDoesNotFit(page: PageLike, options: PdfRenderOptions): Promise<void> {
  if (options.footer !== DEFAULT_PDF_FOOTER || options.onWarning === undefined) return;
  let measured: { marginPx?: number; bandPx?: number };
  try {
    const raw = await page.evaluate(measureFooterFitScript(options.footer, options.margin.bottom));
    measured = JSON.parse(String(raw)) as { marginPx?: number; bandPx?: number };
  } catch {
    // 測れないなら黙る。測定に失敗したことを警告に変えても読者は何もできない。
    return;
  }
  if (!Number.isFinite(measured.marginPx) || !Number.isFinite(measured.bandPx)) return;
  const marginPx = measured.marginPx as number;
  const bandPx = measured.bandPx as number;
  if (bandPx <= 0 || marginPx >= bandPx) return;
  options.onWarning(
    t("pdf.footerMarginTooSmall", { margin: options.margin.bottom, needed: pxToMm(bandPx) }),
  );
}

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
        throw new BrowserSetupError(t("pdf.pageLoadFailed", { detail: (error as Error).message }));
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

      await warnIfFooterDoesNotFit(page, options);

      // 紙に載る文字だけを測る。帯は文書とは別の文脈で描かれるため、内容を monodocs が
      // 決めている既定フッタのときだけ、その姿を別途渡して一緒に測る。
      if (options.fontCheck !== undefined) {
        await runFontCheck(page, {
          mode: options.fontCheck,
          context: "pdf",
          // 警告の宛先が無くても検査は行う。`error` は宛先の有無に関わらずビルドを止める。
          onWarning: options.onWarning ?? (() => {}),
          probes: options.footer === DEFAULT_PDF_FOOTER ? [DEFAULT_PDF_FOOTER_PROBE] : [],
        });
      }

      const pdf = await page.pdf({
        format: options.pageSize,
        margin: options.margin,
        printBackground: options.printBackground,
        // 帯を出す。フラグメントは常に渡す（空でも）。渡さないと Chromium が組み込みの
        // 日付＋タイトルのヘッダへフォールバックし、「出さない」指定が逆の結果になる。
        displayHeaderFooter: true,
        headerTemplate: options.header ?? EMPTY_PDF_BAND,
        footerTemplate: options.footer ?? EMPTY_PDF_BAND,
      });

      // 生成後に HTML サイドバーと同じ フォルダ→ページ 構造のしおりを付与する。
      const withOutline =
        options.outline && destIds.length > 0
          ? await addOutline(pdf, remapDests(options.outline, surrogate))
          : pdf;
      // 文書情報は最後に入れる（しおり付与でも pdf-lib が Producer を書き戻すため）。
      return setPdfMetadata(withOutline, { title: options.title, generator: options.generator });
    },
    async close() {
      if (browser) {
        await browser.close();
        browser = undefined;
      }
    },
  };
}

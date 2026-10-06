import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { MermaidRuntime } from "../config.js";
import { embeddedAssets } from "./index.js";

// The exact version the inline runtime and pre-render embed, so the three modes draw alike.
const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@12.1.0/dist/mermaid.esm.min.mjs";

/**
 * Mermaid のクライアントランタイムを注入する <script> 群を生成する。
 *
 * - `cdn`: ESM を CDN から読み込む（HTML 軽量・要ネットワーク）。
 * - `inline`: `mermaid` パッケージの単一バンドルを埋め込む（自己完結・HTML 肥大）。
 */
// 単一 HTML では非表示ページが display:none のため、その状態で描画すると大きさが
// 取れず壊れる（mermaid の useMaxWidth により幅 0 になる）。そこで表示中ページの
// 未処理 Mermaid のみを描画し、ページ切替時に app.js が再実行する。
// （未訪問ページを含む印刷時の全描画は client mode では困難なため、PDF 出力（v0.5、
// ヘッドレスブラウザで全ページ展開後に描画完了待ち）で対応する。）
const VISIBLE_MERMAID = "#content article:not([hidden]) .mermaid";

/**
 * `window.__sdRenderMermaid()` を定義する JS（runtime 共通）。
 * 通常は app.js がルート確定後（ページ表示のたび）に呼ぶ。ランタイムが遅れて
 * 読み込まれた場合に備え、既にルート確定済み（`__sdRouted`）なら自分で 1 度描画する。
 */
function renderHelper(mermaidExpr: string): string {
  return (
    `window.__sdRenderMermaid=function(){` +
    `${mermaidExpr}.run({querySelector:"${VISIBLE_MERMAID}"});` +
    `};if(window.__sdRouted)window.__sdRenderMermaid();`
  );
}

/**
 * mermaid のブラウザ用バンドル（`mermaid.min.js`）本体を返す。
 * 単一実行ファイルでは node_modules が無いため、埋め込み済み（`embeddedAssets`）を優先し、
 * 無ければ `mermaid` パッケージから読み込む。inline runtime と pre-render の双方で使う。
 */
export async function loadMermaidInline(): Promise<string> {
  return (
    embeddedAssets()?.mermaidInline ??
    (await readFile(createRequire(import.meta.url).resolve("mermaid/dist/mermaid.min.js"), "utf8"))
  );
}

/**
 * The third-party notices for the inline runtime, generated from its source map by
 * `scripts/generate-mermaid-notices.mjs` (roadmap 21.3). The single executable has no file system
 * copy, so the embedded one comes first, as for the runtime itself.
 */
export async function loadMermaidNotices(): Promise<string> {
  return (
    embeddedAssets()?.mermaidNotices ??
    (await readFile(new URL("./mermaid-notices.txt", import.meta.url), "utf8"))
  );
}

/**
 * Wraps text in a `/*! *\/` comment that survives minifiers, inside a classic `<script>`. Nothing in
 * the text can end the comment (`*\/`) or the script element (`</script`), and `<!--` is broken up so
 * the HTML parser never enters its script-data escaped states.
 */
export function noticeComment(text: string): string {
  const safe = text
    .replace(/\*\//g, "*\\/")
    .replace(/<\/(script)/gi, "<\\/$1")
    .replace(/<!--/g, "<\\!--");
  return `/*!\n${safe}\n*/\n`;
}

export async function mermaidRuntimeScript(runtime: MermaidRuntime): Promise<string> {
  if (runtime === "inline") {
    const [lib, notices] = await Promise.all([loadMermaidInline(), loadMermaidNotices()]);
    return (
      `<script>${noticeComment(notices)}${lib}</script>\n` +
      `<script>(function(){` +
      `var ns=window.__esbuild_esm_mermaid_nm;var m=ns&&ns.mermaid;m=m&&(m.default||m);` +
      `if(!m&&window.mermaid)m=window.mermaid;` +
      `if(m&&m.initialize){m.initialize({startOnLoad:false});` +
      renderHelper("m") +
      `}` +
      `})();</script>`
    );
  }
  return (
    `<script type="module">` +
    `import mermaid from "${MERMAID_CDN}";mermaid.initialize({startOnLoad:false});` +
    renderHelper("mermaid") +
    `</script>`
  );
}

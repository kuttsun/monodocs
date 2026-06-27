import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { MermaidRuntime } from "../config.js";

const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

/**
 * Mermaid のクライアントランタイムを注入する <script> 群を生成する。
 *
 * - `cdn`: ESM を CDN から読み込む（HTML 軽量・要ネットワーク）。
 * - `inline`: `mermaid` パッケージの単一バンドルを埋め込む（自己完結・HTML 肥大）。
 */
export async function mermaidRuntimeScript(runtime: MermaidRuntime): Promise<string> {
  if (runtime === "inline") {
    const require = createRequire(import.meta.url);
    const lib = await readFile(require.resolve("mermaid/dist/mermaid.min.js"), "utf8");
    return (
      `<script>${lib}</script>\n` +
      `<script>(function(){` +
      `var ns=window.__esbuild_esm_mermaid_nm;var m=ns&&ns.mermaid;m=m&&(m.default||m);` +
      `if(!m&&window.mermaid)m=window.mermaid;` +
      `if(m&&m.initialize)m.initialize({startOnLoad:true});` +
      `})();</script>`
    );
  }
  return (
    `<script type="module">` +
    `import mermaid from "${MERMAID_CDN}";mermaid.initialize({startOnLoad:true});` +
    `</script>`
  );
}

import { toText } from "hast-util-to-text";
import { visit } from "unist-util-visit";
import type { Element, ElementContent, Root as HastRoot, RootContent } from "hast";
import { isMath } from "./mathRender.js";
import type { Heading } from "../types.js";

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

export type PrefixResult = {
  headings: Heading[];
  text: string;
  /** prefix 後の全要素 ID（文書順）。他ページからのアンカーリンク解決に使う。 */
  anchors: string[];
};

/**
 * 単一 HTML 内での ID 衝突を避けるため、HAST 上のすべての要素 ID を
 * `{prefix}-{元のID}` に書き換え、同一文書内アンカー（`href="#id"`）も追従させる。
 * あわせて見出し一覧・プレーンテキスト・付与後の ID 一覧を収集して返す。
 *
 * Markdown / AsciiDoc 双方の renderer が共有する。これにより見出しだけでなく
 * 脚注（remark-gfm / Asciidoctor）や任意の `[[id]]` 付き要素も衝突しなくなる。
 *
 * 注意: tree を破壊的に変更する。
 */
export function prefixIdsAndCollect(tree: HastRoot, prefix: string): PrefixResult {
  const idMap = new Map<string, string>();
  const headings: Heading[] = [];
  // ページ内に同名 ID が複数あっても解決先は 1 つなので Set で重複を潰す。
  const anchors = new Set<string>();
  let anonHeadingIndex = 0;

  // 1) 全要素 ID を prefix し、旧 ID → 新 ID の対応と見出し一覧を収集する。
  visit(tree, (node) => {
    if (node.type !== "element") return;
    const element = node as Element;
    const id = element.properties.id;
    if (typeof id === "string" && id) {
      const newId = `${prefix}-${id}`;
      idMap.set(id, newId);
      element.properties.id = newId;
      anchors.add(newId);
    }
    if (HEADING_TAGS.has(element.tagName)) {
      // ID 無し見出し（AsciiDoc の doctitle h1 など）にも一意な ID を付与し、
      // DOM と headings 一覧を一致させる（TOC / search からのリンク用）。
      let headingId: string;
      if (typeof element.properties.id === "string" && element.properties.id) {
        headingId = element.properties.id;
      } else {
        headingId = anonHeadingIndex === 0 ? prefix : `${prefix}-h${anonHeadingIndex}`;
        anonHeadingIndex++;
        element.properties.id = headingId;
        anchors.add(headingId);
      }
      headings.push({
        level: Number(element.tagName.slice(1)),
        id: headingId,
        text: toText(withFormulasAsText(element, "heading")),
      });
    }
  });

  // 2) 同一文書内アンカー（href="#id"）を prefix 後の ID に書き換える。
  visit(tree, (node) => {
    if (node.type !== "element") return;
    const element = node as Element;
    if (element.tagName !== "a") return;
    const href = element.properties.href;
    if (typeof href === "string" && href.startsWith("#")) {
      const mapped = idMap.get(href.slice(1));
      if (mapped) element.properties.href = `#${mapped}`;
    }
  });

  return { headings, text: toText(withFormulasAsText(tree, "search")), anchors: [...anchors] };
}

/**
 * A copy of the tree with each formula as its TeX, for text that is read rather than rendered: a
 * heading in the lists of headings shows `$TeX$`, and search indexes the TeX without delimiters, a
 * display formula apart from the text around it (roadmap 6.4). The MathML itself — tokens and the TeX
 * annotation together — is never read as text.
 */
function withFormulasAsText<T extends HastRoot | Element>(node: T, use: "heading" | "search"): T {
  const map = (n: RootContent | ElementContent): RootContent | ElementContent => {
    if (n.type === "element" && isMath(n)) {
      const tex = (n as Element).properties.dataMathTex as string;
      if (use === "heading") return { type: "text", value: `$${tex}$` };
      const display = ((n as Element).properties.className as string[]).includes("math-display");
      return display
        ? {
            type: "element",
            tagName: "div",
            properties: {},
            children: [{ type: "text", value: tex }],
          }
        : { type: "text", value: tex };
    }
    if (n.type !== "element") return n;
    return { ...n, children: n.children.map(map) as ElementContent[] };
  };
  return { ...node, children: (node.children as (RootContent | ElementContent)[]).map(map) } as T;
}

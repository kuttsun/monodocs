import { dirname } from "node:path";
import { convert, load } from "@asciidoctor/core";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { toText } from "hast-util-to-text";
import { visit } from "unist-util-visit";
import type { Element, Root as HastRoot } from "hast";
import type {
  Heading,
  PageMeta,
  RenderContext,
  RenderedContent,
  SourceFile,
  SourceRenderer,
} from "../../types.js";
import { toPageMeta } from "../meta.js";

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/**
 * Asciidoctor の変換オプションを生成する。
 *
 * - `safe` モードで include をドキュメントのディレクトリ配下に jail する
 *   （`base_dir` を入力ファイルのディレクトリにすることで相対 include を正しく解決し、
 *   外部へのアクセスを防ぐ）。
 * - `standalone:false` で本文のみ、`showtitle` で `= Title` を h1 として出力する。
 *
 * 注意: 変換後 HTML はそのまま埋め込むため、入力は信頼できるドキュメントを前提とする
 * （AsciiDoc は passthrough で生 HTML を出力できる）。
 */
function buildOptions(source: SourceFile): Record<string, unknown> {
  return {
    safe: "safe",
    standalone: false,
    base_dir: dirname(source.absolutePath),
    attributes: { showtitle: true },
  };
}

/** Asciidoctor.js を使う AsciiDoc 用の SourceRenderer。 */
export const asciidocRenderer: SourceRenderer = {
  format: "asciidoc",
  extensions: [".adoc", ".asciidoc", ".asc"],

  async extractMeta(source: SourceFile): Promise<PageMeta> {
    const doc = await load(source.raw, buildOptions(source));
    const rawTitle = doc.getDocumentTitle();
    const docTitle = typeof rawTitle === "string" ? rawTitle : undefined;

    // `:sd-*:` 属性をメタデータとして読む（タイトル優先順位: sd-title > = Title）。
    return toPageMeta(
      {
        title: doc.getAttribute("sd-title"),
        order: doc.getAttribute("sd-order"),
        hidden: doc.getAttribute("sd-hidden"),
        description: doc.getAttribute("sd-description"),
      },
      docTitle,
    );
  },

  async render(source: SourceFile, context: RenderContext): Promise<RenderedContent> {
    const rawHtml = (await convert(source.raw, buildOptions(source))) as string;

    const prefix = context.page.id;
    const idMap = new Map<string, string>();
    const headings: Heading[] = [];
    const out = { text: "" };
    let anonHeadingIndex = 0;

    const file = await unified()
      .use(rehypeParse, { fragment: true })
      .use(() => (tree: HastRoot) => {
        // 1) 全要素 ID を page id で prefix（単一 HTML 内の衝突回避）し、
        //    旧 ID → 新 ID の対応と見出し一覧を収集する。
        visit(tree, (node) => {
          if (node.type !== "element") return;
          const element = node as Element;
          const id = element.properties.id;
          if (typeof id === "string" && id) {
            const newId = `${prefix}-${id}`;
            idMap.set(id, newId);
            element.properties.id = newId;
          }
          if (HEADING_TAGS.has(element.tagName)) {
            // ID 無し見出し（showtitle で出る doctitle h1 など）にも一意な ID を付与し、
            // DOM と headings 一覧を一致させる（TOC / search からのリンク用）。
            let headingId: string;
            if (typeof element.properties.id === "string" && element.properties.id) {
              headingId = element.properties.id;
            } else {
              headingId = anonHeadingIndex === 0 ? prefix : `${prefix}-h${anonHeadingIndex}`;
              anonHeadingIndex++;
              element.properties.id = headingId;
            }
            headings.push({
              level: Number(element.tagName.slice(1)),
              id: headingId,
              text: toText(element),
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

        out.text = toText(tree);
      })
      .use(rehypeStringify)
      .process(rawHtml);

    return {
      html: String(file),
      text: out.text,
      headings,
      links: [],
      assets: [],
    };
  },
};

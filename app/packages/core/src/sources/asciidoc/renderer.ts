import { dirname } from "node:path";
import { convert, load } from "@asciidoctor/core";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import type { Root as HastRoot } from "hast";
import type {
  Heading,
  PageMeta,
  RenderContext,
  RenderedContent,
  SourceFile,
  SourceRenderer,
} from "../../types.js";
import { toPageMeta } from "../meta.js";
import { prefixIdsAndCollect } from "../prefixIds.js";

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

    const out = { headings: [] as Heading[], text: "" };

    // 全要素 ID を page id で prefix し、同一文書内アンカーを追従させる
    // （見出し・xref・脚注などの単一 HTML 内 ID 衝突を回避）。Markdown と共通処理。
    const file = await unified()
      .use(rehypeParse, { fragment: true })
      .use(() => (tree: HastRoot) => {
        const result = prefixIdsAndCollect(tree, context.page.id);
        out.headings = result.headings;
        out.text = result.text;
      })
      .use(rehypeStringify)
      .process(rawHtml);

    return {
      html: String(file),
      text: out.text,
      headings: out.headings,
      links: [],
      assets: [],
    };
  },
};

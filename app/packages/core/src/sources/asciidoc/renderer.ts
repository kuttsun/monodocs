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
function buildOptions(
  source: SourceFile,
  attributes: Readonly<Record<string, string>>,
): Record<string, unknown> {
  return {
    safe: "safe",
    standalone: false,
    base_dir: dirname(source.absolutePath),
    // 設定由来の属性が先。monodocs 自身が必要とするものは後に置いて上書きされないようにする。
    // 値はすべて `@` 付き（soft set）で届くので、文書が自分で指定すればそちらが勝つ（17.5）。
    attributes: { ...attributes, showtitle: true },
  };
}

/**
 * 設定で解決済みの AsciiDoc 属性を束ねた SourceRenderer を作る。
 *
 * A factory rather than a module constant, because the attributes come from the configuration and a
 * renderer has no other way to reach it: `extractMeta` takes only a source, so there is nowhere to
 * hand them in per call. `asciidocRenderer` below is this with nothing configured, which is what a
 * caller reaching core directly gets.
 */
export function createAsciidocRenderer(
  attributes: Readonly<Record<string, string>> = {},
): SourceRenderer {
  return {
    format: "asciidoc",
    extensions: [".adoc", ".asciidoc", ".asc"],

    async extractMeta(source: SourceFile): Promise<PageMeta> {
      const doc = await load(source.raw, buildOptions(source, attributes));
      const rawTitle = doc.getDocumentTitle();
      const docTitle = typeof rawTitle === "string" ? rawTitle : undefined;

      // `:sd-*:` 属性をメタデータとして読む（タイトル優先順位: sd-title > = Title）。
      return toPageMeta(
        {
          title: doc.getAttribute("sd-title"),
          order: doc.getAttribute("sd-order"),
          hidden: doc.getAttribute("sd-hidden"),
          description: doc.getAttribute("sd-description"),
          aliases: doc.getAttribute("sd-aliases"),
        },
        docTitle,
      );
    },

    async render(source: SourceFile, context: RenderContext): Promise<RenderedContent> {
      const rawHtml = (await convert(source.raw, buildOptions(source, attributes))) as string;

      const out = { headings: [] as Heading[], text: "", anchors: [] as string[] };

      // 全要素 ID を page id で prefix し、同一文書内アンカーを追従させる
      // （見出し・xref・脚注などの単一 HTML 内 ID 衝突を回避）。Markdown と共通処理。
      const file = await unified()
        .use(rehypeParse, { fragment: true })
        .use(() => (tree: HastRoot) => {
          const result = prefixIdsAndCollect(tree, context.page.id);
          out.headings = result.headings;
          out.text = result.text;
          out.anchors = result.anchors;
        })
        .use(rehypeStringify)
        .process(rawHtml);

      return {
        html: String(file),
        text: out.text,
        headings: out.headings,
        anchors: out.anchors,
        links: [],
        assets: [],
      };
    },
  };
}

/** 設定を持たない既定の AsciiDoc renderer（core を直接使う呼び出し側向け）。 */
export const asciidocRenderer: SourceRenderer = createAsciidocRenderer();

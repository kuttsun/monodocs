import { unified, type Plugin } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { toString as mdastToString } from "mdast-util-to-string";
import { toText } from "hast-util-to-text";
import { visit } from "unist-util-visit";
import type { Element, Root as HastRoot } from "hast";
import type { Heading as MdastHeading, Root as MdastRoot } from "mdast";
import type {
  Heading,
  PageMeta,
  RenderContext,
  RenderedContent,
  SourceFile,
  SourceRenderer,
} from "../../types.js";

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

type CollectOptions = {
  /** 見出し ID に付与する page id（衝突回避用 prefix）。 */
  prefix: string;
  /** 抽出結果の格納先。 */
  out: { headings: Heading[]; text: string };
};

/**
 * 見出し ID に page id を prefix して衝突を防ぎつつ、
 * 見出し一覧とプレーンテキストを収集する rehype プラグイン。
 */
const collectHeadingsAndText: Plugin<[CollectOptions], HastRoot> = ({ prefix, out }) => {
  return (tree) => {
    visit(tree, (node) => {
      if (node.type !== "element") return;
      const element = node as Element;
      if (!HEADING_TAGS.has(element.tagName)) return;

      const slug = typeof element.properties.id === "string" ? element.properties.id : "";
      const id = slug ? `${prefix}-${slug}` : prefix;
      element.properties.id = id;

      out.headings.push({
        level: Number(element.tagName.slice(1)),
        id,
        text: toText(element),
      });
    });
    out.text = toText(tree);
  };
};

/** Markdown 用の SourceRenderer（unified / remark / rehype）。 */
export const markdownRenderer: SourceRenderer = {
  format: "markdown",
  extensions: [".md", ".markdown"],

  async extractMeta(source: SourceFile): Promise<PageMeta> {
    const tree = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ["yaml"])
      .parse(source.raw) as MdastRoot;

    let title: string | undefined;
    visit(tree, (node) => {
      if (title !== undefined) return;
      if (node.type === "heading" && (node as MdastHeading).depth === 1) {
        const text = mdastToString(node).trim();
        if (text) title = text;
      }
    });

    return { title };
  },

  async render(source: SourceFile, context: RenderContext): Promise<RenderedContent> {
    const out = { headings: [] as Heading[], text: "" };

    const file = await unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ["yaml"])
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeSlug)
      .use(collectHeadingsAndText, { prefix: context.page.id, out })
      .use(rehypeStringify)
      .process(source.raw);

    return {
      html: String(file),
      text: out.text,
      headings: out.headings,
      links: [],
      assets: [],
    };
  },
};

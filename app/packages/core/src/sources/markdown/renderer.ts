import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { parse as parseYaml } from "yaml";
import { toString as mdastToString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import type { Root as HastRoot } from "hast";
import type { Heading as MdastHeading, Root as MdastRoot, Yaml } from "mdast";
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

/** Markdown 用の SourceRenderer（unified / remark / rehype）。 */
export const markdownRenderer: SourceRenderer = {
  format: "markdown",
  extensions: [".md", ".markdown"],

  async extractMeta(source: SourceFile): Promise<PageMeta> {
    const tree = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ["yaml"])
      .parse(source.raw) as MdastRoot;

    let frontmatter: Record<string, unknown> = {};
    let h1: string | undefined;
    visit(tree, (node) => {
      if (node.type === "yaml") {
        try {
          const parsed = parseYaml((node as Yaml).value);
          if (parsed && typeof parsed === "object") {
            frontmatter = parsed as Record<string, unknown>;
          }
        } catch {
          // frontmatter が不正な YAML でも無視（タイトル等はフォールバックする）。
        }
      }
      if (h1 === undefined && node.type === "heading" && (node as MdastHeading).depth === 1) {
        const text = mdastToString(node).trim();
        if (text) h1 = text;
      }
    });

    // タイトル優先順位: frontmatter.title > H1 >（ファイル名は buildPages 側）
    return toPageMeta(frontmatter, h1);
  },

  async render(source: SourceFile, context: RenderContext): Promise<RenderedContent> {
    const out = { headings: [] as Heading[], text: "" };

    const file = await unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ["yaml"])
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeSlug)
      // 見出しだけでなく脚注など全要素の ID を page id で prefix し、
      // 同一文書内アンカーを追従させる（単一 HTML 内の ID 衝突回避）。
      .use(() => (tree: HastRoot) => {
        const result = prefixIdsAndCollect(tree, context.page.id);
        out.headings = result.headings;
        out.text = result.text;
      })
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

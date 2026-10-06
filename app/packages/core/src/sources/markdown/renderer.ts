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
import type {
  Definition,
  Heading as MdastHeading,
  Link,
  LinkReference,
  Root as MdastRoot,
  Yaml,
} from "mdast";
import type {
  Heading,
  LinkRef,
  PageMeta,
  RenderContext,
  RenderedContent,
  SourceFile,
  SourceRenderer,
} from "../../types.js";
import { toPageMeta } from "../meta.js";
import { joinSegmentBreaks, remarkSoftBreaksToBreaks, type LineBreak } from "../lineBreak.js";
import { prefixIdsAndCollect } from "../prefixIds.js";
import { remarkPageBreak } from "./pageBreak.js";
import { remarkMath, type BlockMath, type InlineMath } from "./math.js";
import { mathPlaceholder, rehypeRenderMath, type MathProblem } from "../mathRender.js";
import type { Handlers } from "mdast-util-to-hast";
import type { Nodes } from "mdast";

function normalizeReferenceId(identifier: string): string {
  return identifier.trim().replace(/\s+/g, " ").toUpperCase();
}

function toLinkRef(href: string, node: Link | LinkReference): LinkRef {
  const text = mdastToString(node).trim();
  return {
    href,
    text: text || undefined,
    line: node.position?.start.line,
    column: node.position?.start.column,
  };
}

function collectLinks(tree: MdastRoot): LinkRef[] {
  const definitions = new Map<string, Definition>();
  const links: LinkRef[] = [];

  visit(tree, (node) => {
    if (node.type === "definition") {
      const definition = node as Definition;
      definitions.set(normalizeReferenceId(definition.identifier), definition);
    }
  });

  visit(tree, (node) => {
    if (node.type === "link") {
      const link = node as Link;
      links.push(toLinkRef(link.url, link));
      return;
    }

    if (node.type === "linkReference") {
      const reference = node as LinkReference;
      const definition = definitions.get(normalizeReferenceId(reference.identifier));
      if (definition) links.push(toLinkRef(definition.url, reference));
    }
  });

  return links;
}

/** A heading's text with each formula as `$TeX$`, as the lists of headings show it (roadmap 6.4). */
function headingText(node: Nodes): string {
  if (node.type === "inlineMath") return `$${node.value}$`;
  if ("children" in node) return node.children.map((c) => headingText(c as Nodes)).join("");
  return mdastToString(node);
}

const mathHandlers: Handlers = {
  inlineMath(state, node: InlineMath) {
    const element = mathPlaceholder(node.value, node.data.source, node.data.display, false);
    state.patch(node, element);
    return element;
  },
  math(state, node: BlockMath) {
    const element = mathPlaceholder(node.value, node.data.source, true, true);
    state.patch(node, element);
    return element;
  },
};

/**
 * Markdown 用の SourceRenderer（unified / remark / rehype）を作る。
 *
 * `lineBreak` is applied here rather than in post-processing, because the page's text for search is
 * collected in this renderer and `postprocessPages` does not recompute it (roadmap 12.6).
 */
export function createMarkdownRenderer(
  options: { lineBreak?: LineBreak; math?: boolean } = {},
): SourceRenderer {
  const lineBreak = options.lineBreak ?? "space";
  // Math is on unless turned off (`math.enabled`, roadmap 6.4).
  const math = options.math ?? true;
  return {
    format: "markdown",
    extensions: [".md", ".markdown"],

    async extractMeta(source: SourceFile): Promise<PageMeta> {
      // remarkMath finds the formulas while the tree is parsed, so a parse is enough.
      const tree = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ["yaml"])
        .use(math ? [remarkMath] : [])
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
          const text = headingText(node as Nodes).trim();
          if (text) h1 = text;
        }
      });

      // タイトル優先順位: frontmatter.title > H1 >（ファイル名は buildPages 側）
      return toPageMeta(frontmatter, h1);
    },

    async render(source: SourceFile, context: RenderContext): Promise<RenderedContent> {
      const out = { headings: [] as Heading[], text: "", anchors: [] as string[] };
      let links: LinkRef[] = [];
      const problems: MathProblem[] = [];

      const file = await unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ["yaml"])
        .use(remarkGfm)
        .use(math ? [remarkMath] : [])
        .use(() => (tree: MdastRoot) => {
          links = collectLinks(tree);
        })
        // The page-break marker is picked up before remark-rehype, which is where raw HTML is dropped.
        .use(remarkPageBreak)
        .use(lineBreak === "break" ? [remarkSoftBreaksToBreaks] : [])
        .use(remarkRehype, math ? { handlers: mathHandlers } : {})
        .use(lineBreak === "join" ? [() => joinSegmentBreaks] : [])
        .use(rehypeSlug)
        // After the IDs are made from the formulas' TeX, as they were before math was rendered.
        .use(math ? [() => rehypeRenderMath((problem) => problems.push(problem))] : [])
        // 見出しだけでなく脚注など全要素の ID を page id で prefix し、
        // 同一文書内アンカーを追従させる（単一 HTML 内の ID 衝突回避）。
        .use(() => (tree: HastRoot) => {
          const result = prefixIdsAndCollect(tree, context.page.id);
          out.headings = result.headings;
          out.text = result.text;
          out.anchors = result.anchors;
        })
        .use(rehypeStringify)
        .process(source.raw);

      return {
        html: String(file),
        text: out.text,
        headings: out.headings,
        anchors: out.anchors,
        links,
        assets: [],
        math: problems,
      };
    },
  };
}

/** 設定を持たない既定の Markdown renderer（core を直接使う呼び出し側向け）。 */
export const markdownRenderer: SourceRenderer = createMarkdownRenderer();

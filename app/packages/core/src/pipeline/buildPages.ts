import type {
  PageMeta,
  Page,
  SourceFile,
  SourceRenderer,
  TitleFrom,
  TitleTransform,
} from "../types.js";
import { type Diagnostic, MonodocsError, warn } from "../diagnostics.js";
import { toAliasRoute, toPageId, toRoute } from "../route.js";
import { applyTitleTransform, DEFAULT_TITLE_TRANSFORM } from "./titleTransform.js";
import { t } from "../messages.js";

export type BuildPagesResult = {
  pages: Page[];
  warnings: Diagnostic[];
};

export type BuildPagesOptions = {
  /** 明示タイトルではなく、見出し・ファイル名から導出した表示タイトルへ適用する変換。 */
  titleTransform?: TitleTransform;
  /**
   * 見出し（H1 / 文書タイトル）とファイル名のどちらをタイトルに使うか。
   * `"heading"`（既定）= frontmatter → 見出し → ファイル名。
   * `"filename"` = frontmatter → ファイル名（見出しは本文に残るがタイトルには使わない）。
   * 明示タイトル（frontmatter `title` / `:sd-title:`）はどちらでも常に最優先。
   */
  titleFrom?: TitleFrom;
};

/** ファイル名（拡張子除く）からタイトルを導出する。 */
function deriveTitleFromPath(relativePath: string): string {
  const base = relativePath.split("/").pop() ?? relativePath;
  const name = base.replace(/\.[^.]+$/, "");
  if (name === "index") return "Home";
  return name;
}

/**
 * タイトルを優先順位に従って解決する。
 * 明示タイトル（frontmatter / `:sd-title:`）は常に最優先。次に `titleFrom` が `"heading"` なら
 * 見出しタイトル、`"filename"` なら見出しを飛ばしてファイル名へ。返り値の `fromFilename` は
 * 「ファイル名へフォールバックしたか」（タイトル欠落の警告判定に使う）。
 */
function resolveTitle(
  meta: PageMeta,
  relativePath: string,
  options: BuildPagesOptions,
): { title: string; fromFilename: boolean } {
  const explicit = meta.title?.trim();
  if (explicit) return { title: explicit, fromFilename: false };
  const titleTransform = options.titleTransform ?? DEFAULT_TITLE_TRANSFORM;

  if ((options.titleFrom ?? "heading") !== "filename") {
    const heading = meta.headingTitle?.trim();
    if (heading) {
      return { title: applyTitleTransform(heading, titleTransform), fromFilename: false };
    }
  }

  return {
    title: applyTitleTransform(deriveTitleFromPath(relativePath), titleTransform),
    fromFilename: true,
  };
}

/**
 * ソースファイル群を renderer で処理し、共通の Page モデルへ正規化する。
 * route の重複はエラー、タイトル欠落は警告とする。
 */
export async function buildPages(
  sources: SourceFile[],
  renderers: SourceRenderer[],
  options: BuildPagesOptions = {},
): Promise<BuildPagesResult> {
  const rendererByFormat = new Map(renderers.map((r) => [r.format, r]));
  const pages: Page[] = [];
  const warnings: Diagnostic[] = [];
  const seenRoutes = new Map<string, string>();
  const seenPageIds = new Map<string, string>();

  for (const source of sources) {
    const renderer = rendererByFormat.get(source.format);
    if (!renderer) {
      warnings.push(
        warn(
          "page/no-renderer",
          t("pages.noRenderer", { path: source.relativePath, format: source.format }),
          {
            path: source.relativePath,
          },
        ),
      );
      continue;
    }

    const route = toRoute(source.relativePath);
    const id = toPageId(route);

    const existing = seenRoutes.get(route);
    if (existing) {
      throw new MonodocsError(
        "page/duplicate-route",
        t("pages.routeCollision", {
          route,
          first: existing,
          second: source.relativePath,
        }),
      );
    }
    seenRoutes.set(route, source.relativePath);

    // route が異なっても page id が衝突しうる（例: "a-b.md" と "a/b.md" は
    // どちらも "a-b"）。見出し ID prefix の衝突を防ぐため検知してエラーにする。
    const existingPageId = seenPageIds.get(id);
    if (existingPageId) {
      throw new MonodocsError(
        "page/duplicate-id",
        t("pages.pageIdCollision", {
          id,
          first: existingPageId,
          second: source.relativePath,
        }),
      );
    }
    seenPageIds.set(id, source.relativePath);

    const meta = await renderer.extractMeta(source);
    const rendered = await renderer.render(source, {
      page: { id, route, relativePath: source.relativePath, format: source.format },
    });

    const { title, fromFilename } = resolveTitle(meta, source.relativePath, options);
    // ファイル名へフォールバックしたら警告する。ただし titleFrom: "filename" のときは
    // ファイル名が指定された取得元なので「タイトル欠落」ではなく、警告しない。
    if (fromFilename && (options.titleFrom ?? "heading") !== "filename") {
      warnings.push(
        warn("page/no-title", t("pages.noTitle", { path: source.relativePath, title }), {
          path: source.relativePath,
        }),
      );
    }

    pages.push({
      id,
      route,
      sourcePath: source.absolutePath,
      relativePath: source.relativePath,
      format: source.format,
      title,
      order: meta.order,
      hidden: meta.hidden,
      description: meta.description,
      // Normalised here so that a spelling cannot decide a collision; validated once every page is
      // known, because whether an alias is shadowed depends on routes that may not exist yet (15.5).
      aliases: dedupe((meta.aliases ?? []).map(toAliasRoute)),
      rawSource: source.raw,
      html: rendered.html,
      text: rendered.text,
      headings: rendered.headings,
      anchors: rendered.anchors,
      links: rendered.links,
      assets: rendered.assets,
    });
  }

  resolveAliases(pages, warnings);

  // order（明示順）→ route の順に並べる。
  pages.sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.route.localeCompare(b.route);
  });

  return { pages, warnings };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * 別名の隠蔽と重複を、全ページが揃ってから判定する（15.5）。
 *
 * Shadowing is decided first and only warns, because a real route always wins: an alias that could
 * shadow a page would make a page unreachable, and the page is the thing a reader asked for. The
 * warning says so rather than the alias silently taking precedence — or silently doing nothing.
 *
 * Duplicates are decided afterwards, on what survives, and are an error: two pages answering to one
 * name would be settled by scan order, which is not something an author can reason about. Doing it
 * in this order means two pages claiming an alias that is also a real route produce two warnings and
 * no error, because once both are dropped there is nothing left to be ambiguous about.
 */
function resolveAliases(pages: Page[], warnings: Diagnostic[]): void {
  const routes = new Map(pages.map((page) => [page.route, page.relativePath]));
  const claimed = new Map<string, string>();

  for (const page of pages) {
    const kept: string[] = [];
    for (const alias of page.aliases) {
      const shadowing = routes.get(alias);
      if (shadowing !== undefined) {
        warnings.push(
          warn(
            "page/alias-shadowed",
            t("pages.aliasShadowed", { alias, path: page.relativePath, page: shadowing }),
            { path: page.relativePath },
          ),
        );
        continue;
      }

      const first = claimed.get(alias);
      if (first !== undefined) {
        throw new MonodocsError(
          "page/duplicate-alias",
          t("pages.aliasCollision", { alias, first, second: page.relativePath }),
        );
      }
      claimed.set(alias, page.relativePath);
      kept.push(alias);
    }
    page.aliases = kept;
  }
}

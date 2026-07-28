import type { Page, SidebarItem, SidebarNode, TitleTransform } from "../types.js";
import { applyTitleTransform, DEFAULT_TITLE_TRANSFORM } from "./titleTransform.js";

type DirNode = Extract<SidebarNode, { type: "dir" }>;

export type BuildSidebarOptions = {
  /** フォルダ名から導出した表示タイトルへ適用する変換。 */
  titleTransform?: TitleTransform;
  /**
   * ページを 1 つだけ含む（サブフォルダを持たない）ディレクトリ階層を畳み、その唯一のページを
   * 親へ繰り上げる。route / pageId は変えずサイドバーの表示だけを変えるので到達性は失わない。
   */
  flattenSingleChild?: boolean;
};

/**
 * ページのフォルダ構造からサイドバーのツリーを生成する。
 * `hidden` なページは除外する。ページの並びは buildPages のソート順を引き継ぐ。
 */
export function buildSidebar(pages: Page[], options: BuildSidebarOptions = {}): SidebarNode[] {
  const root: SidebarNode[] = [];
  const dirs = new Map<string, DirNode>();

  /** 指定ディレクトリパスの子配列を取得（無ければ親をたどって生成）。 */
  function childrenOf(dirPath: string): SidebarNode[] {
    if (dirPath === "") return root;
    const existing = dirs.get(dirPath);
    if (existing) return existing.children;

    const segments = dirPath.split("/");
    const name = segments[segments.length - 1] ?? dirPath;
    const title = applyTitleTransform(name, options.titleTransform ?? DEFAULT_TITLE_TRANSFORM);
    const parentPath = segments.slice(0, -1).join("/");

    const node: DirNode = { type: "dir", title, path: dirPath, children: [] };
    dirs.set(dirPath, node);
    childrenOf(parentPath).push(node);
    return node.children;
  }

  for (const page of pages) {
    if (page.hidden) continue;
    const slash = page.relativePath.lastIndexOf("/");
    const dirPath = slash === -1 ? "" : page.relativePath.slice(0, slash);
    childrenOf(dirPath).push({
      type: "page",
      title: page.title,
      route: page.route,
      pageId: page.id,
    });
  }

  return options.flattenSingleChild ? flattenSingleChildDirs(root) : root;
}

/** {@link buildCustomSidebar} の結果。警告は validate / build のログへ流す。 */
export type CustomSidebarResult = {
  sidebar: SidebarNode[];
  warnings: string[];
  /** items に現れた順のページ（重複は最初の 1 回のみ）。閲覧順の並べ替えに使う。 */
  orderedPages: Page[];
};

/** 設定に書かれた path を relativePath と比較できる形に正規化する。 */
function normalizeItemPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

/**
 * 設定ファイルの `sidebar.items` からサイドバーのツリーを生成する（`sidebar.mode: "custom"`）。
 *
 * 構造も順序も著者が書いたとおりにする。したがってフォルダ構造由来の
 * `titleTransform.directory` / `flattenSingleChild` は適用しない。
 * ページの `title` 省略時はページ自身のタイトル（frontmatter → 見出し → ファイル名）を使う。
 *
 * 存在しない path はエラー（roadmap 27.1）。`hidden` なページの指定と、items に現れない
 * ページ、同じページの重複指定は警告にとどめる（いずれも route では到達できるため）。
 */
export function buildCustomSidebar(pages: Page[], items: SidebarItem[]): CustomSidebarResult {
  const byPath = new Map<string, Page>();
  for (const page of pages) byPath.set(page.relativePath, page);

  const warnings: string[] = [];
  const orderedPages: Page[] = [];
  const seen = new Set<string>();

  function convert(item: SidebarItem): SidebarNode | undefined {
    if (item.children) {
      const children = item.children.map(convert).filter((node) => node !== undefined);
      // 子がすべて落ちた（hidden のみ等）グループは見出しだけが残るため出さない。
      if (children.length === 0) {
        warnings.push(`Sidebar group has no visible pages: ${item.title ?? ""}`);
        return undefined;
      }
      // path はフォルダ構造由来の識別子。custom では対応するフォルダが無いので空にする。
      return { type: "dir", title: item.title ?? "", path: "", children };
    }

    const relativePath = normalizeItemPath(item.path ?? "");
    const page = byPath.get(relativePath);
    if (!page) {
      // ファイル自体はあっても sidebar.exclude や対象拡張子の設定でページ化されていない
      // ことがあるため、探す場所を示す。
      throw new Error(
        `Sidebar item not found: ${item.path}` +
          ` (paths are relative to input and must resolve to a generated page;` +
          ` check sidebar.exclude and sources.*.extensions)`,
      );
    }
    if (page.hidden) {
      warnings.push(`Sidebar item is hidden and was skipped: ${item.path}`);
      return undefined;
    }
    if (seen.has(page.id)) {
      warnings.push(`Sidebar item appears more than once: ${item.path}`);
      return undefined;
    }
    seen.add(page.id);
    orderedPages.push(page);
    return { type: "page", title: item.title ?? page.title, route: page.route, pageId: page.id };
  }

  const sidebar = items.map(convert).filter((node) => node !== undefined);

  const missing = pages.filter((page) => !page.hidden && !seen.has(page.id));
  if (missing.length > 0) {
    warnings.push(
      `Not listed in the custom sidebar (reachable only by route): ${missing
        .map((page) => page.relativePath)
        .join(", ")}`,
    );
  }

  return { sidebar, warnings, orderedPages };
}

/**
 * ページを custom サイドバーの並び順に揃える。サイドバーが閲覧順（前後ナビ・PDF の
 * ページ順・初期表示ページ）を決めるようにするため。items に無いページは元の順序のまま
 * 末尾に残す（route では到達できるので落とさない）。
 */
export function orderPagesBySidebar(pages: Page[], orderedPages: Page[]): Page[] {
  const listed = new Set(orderedPages.map((page) => page.id));
  return [...orderedPages, ...pages.filter((page) => !listed.has(page.id))];
}

/**
 * ページを 1 つだけ含む（サブフォルダ無し）のディレクトリ階層を畳み、唯一のページを親へ繰り上げる。
 * ボトムアップ（子を先に畳んでから自分を判定）で再帰するため、`a/b/single.md` のような
 * 単一チェーンも端のページまで畳まれる。サブフォルダや複数ページを持つディレクトリは構造を
 * 持つため対象外。route / pageId には触れず、サイドバーの表示構造だけを変える。
 */
function flattenSingleChildDirs(nodes: SidebarNode[]): SidebarNode[] {
  return nodes.map((node) => {
    if (node.type !== "dir") return node;
    const children = flattenSingleChildDirs(node.children);
    if (children.length === 1 && children[0]?.type === "page") {
      return children[0];
    }
    return { ...node, children };
  });
}

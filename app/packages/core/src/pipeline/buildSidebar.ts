import type { Page, SidebarNode } from "../types.js";

type DirNode = Extract<SidebarNode, { type: "dir" }>;

/**
 * ページのフォルダ構造からサイドバーのツリーを生成する。
 * `hidden` なページは除外する。ページの並びは buildPages のソート順を引き継ぐ。
 */
export function buildSidebar(pages: Page[]): SidebarNode[] {
  const root: SidebarNode[] = [];
  const dirs = new Map<string, DirNode>();

  /** 指定ディレクトリパスの子配列を取得（無ければ親をたどって生成）。 */
  function childrenOf(dirPath: string): SidebarNode[] {
    if (dirPath === "") return root;
    const existing = dirs.get(dirPath);
    if (existing) return existing.children;

    const segments = dirPath.split("/");
    const title = segments[segments.length - 1] ?? dirPath;
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

  return root;
}

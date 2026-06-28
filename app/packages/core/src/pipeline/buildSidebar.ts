import type { Page, SidebarNode } from "../types.js";
import { stripOrderPrefix } from "./orderPrefix.js";

type DirNode = Extract<SidebarNode, { type: "dir" }>;

export type BuildSidebarOptions = {
  /** フォルダ名のタイトルから並び替え用の数値プレフィックスを除去する（`01_setup` → `setup`）。 */
  stripNumberPrefix?: boolean;
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
    const title = options.stripNumberPrefix ? stripOrderPrefix(name) : name;
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

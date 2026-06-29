import type { Page, SidebarNode } from "../types.js";
import { stripOrderPrefix } from "./orderPrefix.js";

type DirNode = Extract<SidebarNode, { type: "dir" }>;

export type BuildSidebarOptions = {
  /** フォルダ名のタイトルから並び替え用の数値プレフィックスを除去する（`01_setup` → `setup`）。 */
  stripNumberPrefix?: boolean;
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

  return options.flattenSingleChild ? flattenSingleChildDirs(root) : root;
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

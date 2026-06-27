import { posix } from "node:path";

/** OS 依存の区切りを POSIX 区切りに正規化する。 */
function normalize(relativePath: string): string {
  return relativePath.split("\\").join("/");
}

/** 拡張子を除いたパスを返す。 */
function stripExtension(p: string): string {
  const ext = posix.extname(p);
  return ext ? p.slice(0, -ext.length) : p;
}

/**
 * 入力ディレクトリからの相対パスを hash route へ変換する。
 *
 * ```text
 * index.md           -> /
 * setup/install.md   -> /setup/install
 * setup/index.md     -> /setup
 * ```
 */
export function toRoute(relativePath: string): string {
  let p = stripExtension(normalize(relativePath));
  if (p === "index") return "/";
  if (p.endsWith("/index")) p = p.slice(0, -"/index".length);
  return "/" + p;
}

/** route のセグメントを ID 用 slug に変換する（unicode 文字は保持）。 */
function slugifySegment(segment: string): string {
  return segment
    .trim()
    .toLowerCase()
    .replace(/[\s/\\]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * route から一意な page id を生成する。
 * 単一 HTML 内での見出し ID 衝突回避（ROADMAP 19章）の prefix にも使う。
 *
 * ```text
 * /                  -> index
 * /setup/install     -> setup-install
 * ```
 */
export function toPageId(route: string): string {
  if (route === "/") return "index";
  const id = route.replace(/^\//, "").split("/").map(slugifySegment).filter(Boolean).join("-");
  return id || "index";
}

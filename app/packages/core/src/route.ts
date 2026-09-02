import { posix } from "node:path";

/** OS 依存の区切りを POSIX 区切りに正規化する。 */
function normalize(relativePath: string): string {
  return relativePath.split("\\").join("/");
}

/**
 * 別名から取り除いてよい拡張子の既定。設定でカスタム拡張子を使う場合は
 * buildPages が解決済みの一覧を渡すので、これは直接呼ぶ利用者向けのフォールバックである。
 */
const DEFAULT_SOURCE_EXTENSIONS = [".md", ".markdown", ".adoc", ".asciidoc", ".asc"];

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

/**
 * 著者が書いた route の別名を、route と同じ形へ正規化する（15.5）。
 *
 * An alias is an old route, and an old route was written in whatever form was to hand: with or
 * without a leading slash, with or without the extension, naming `index` or the directory holding
 * it. Normalising here means `setup/install.md`, `/setup/install`, and `setup/install` are one
 * alias rather than three, and it happens before shadowing and collisions are decided so that
 * neither can turn on a spelling.
 *
 * ```text
 * "/setup/install"     -> /setup/install
 * "setup/install.md"   -> /setup/install
 * "setup/"             -> /setup
 * "index.md"           -> /
 * ```
 */
export function toAliasRoute(
  value: string,
  sourceExtensions: readonly string[] = DEFAULT_SOURCE_EXTENSIONS,
): string {
  let p = normalize(value).trim().replace(/^\/+/, "").replace(/\/+$/, "");
  // Only a source extension is stripped, not whatever `extname` finds. An alias is usually a route
  // rather than a path, and a route may end in something that looks like an extension: `/v1.2` is
  // the route of `v1.2.md`, and stripping `.2` from it would produce `/v1` — an alias that points
  // at a page that does not exist, and that collides with the alias `/v1.3` normalises to.
  const ext = posix.extname(p).toLowerCase();
  if (ext !== "" && sourceExtensions.some((candidate) => candidate.toLowerCase() === ext)) {
    p = p.slice(0, -ext.length);
  }
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

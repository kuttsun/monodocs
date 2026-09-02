import type { PageMeta } from "../types.js";

/**
 * frontmatter（Markdown）/ `:sd-*:` 属性（AsciiDoc）から取り出した生の値を
 * 共通の {@link PageMeta} に正規化する。
 *
 * frontmatter は型付き（order: number, hidden: boolean）、
 * AsciiDoc 属性は文字列で来るため、どちらも受けられるようにする。
 *
 * 明示タイトル（`raw.title`）と見出しタイトル（`headingTitle`）は別フィールドに保持する。
 * どちらを表示に使うかは `sidebar.titleFrom` に応じて buildPages 側で決める。
 */
export function toPageMeta(raw: Record<string, unknown>, headingTitle?: string): PageMeta {
  const meta: PageMeta = {};

  if (typeof raw.title === "string" && raw.title.trim()) meta.title = raw.title.trim();
  if (headingTitle?.trim()) meta.headingTitle = headingTitle.trim();

  if (typeof raw.order === "number" && Number.isFinite(raw.order)) {
    meta.order = raw.order;
  } else if (
    typeof raw.order === "string" &&
    raw.order.trim() !== "" &&
    !Number.isNaN(Number(raw.order))
  ) {
    meta.order = Number(raw.order);
  }

  if (typeof raw.hidden === "boolean") {
    meta.hidden = raw.hidden;
  } else if (typeof raw.hidden === "string") {
    meta.hidden = raw.hidden.trim().toLowerCase() === "true";
  }

  if (typeof raw.description === "string" && raw.description.trim()) {
    meta.description = raw.description.trim();
  }

  // Markdown writes a YAML list, AsciiDoc writes one attribute, so a comma-separated string is the
  // only shape `:sd-aliases:` can take. Both are accepted from either format rather than one being
  // rejected for being written the other way; the values are normalised in buildPages (15.5).
  const aliases = toStringList(raw.aliases);
  if (aliases.length > 0) meta.aliases = aliases;

  return meta;
}

/** リスト（Markdown frontmatter）またはカンマ区切り文字列（AsciiDoc 属性）を文字列配列にする。 */
function toStringList(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : undefined;
  if (!items) return [];
  return items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

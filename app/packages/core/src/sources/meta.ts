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

  return meta;
}

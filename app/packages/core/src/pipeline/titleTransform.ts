import type { TitleTransform } from "../types.js";
import { stripOrderPrefix } from "./orderPrefix.js";

export const DEFAULT_TITLE_TRANSFORM: TitleTransform = { type: "none" };

/**
 * 表示タイトル用の変換を適用する。
 * 変換結果が空文字になる場合は、ナビゲーション上の空タイトルを避けるため元の文字列を返す。
 */
export function applyTitleTransform(
  title: string,
  transform: TitleTransform = DEFAULT_TITLE_TRANSFORM,
): string {
  switch (transform.type) {
    case "none":
      return title;
    case "stripNumberPrefix":
      return stripOrderPrefix(title);
    case "regex": {
      const transformed = title.replace(
        new RegExp(transform.pattern, transform.flags),
        transform.replacement,
      );
      return transformed.length > 0 ? transformed : title;
    }
  }
}

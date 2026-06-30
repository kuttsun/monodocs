/**
 * フォルダ名・ファイル名の先頭にある「並び替え用の数値プレフィックス」を扱うヘルパー。
 *
 * 入力を `01_setup` / `001-intro` のように数字プレフィックスで並べておくと、route の
 * 文字列ソート（buildPages）でそのまま意図した順序になる。一方で表示タイトルには
 * その数字を出したくない、という運用を `sidebar.titleTransform.page` /
 * `sidebar.titleTransform.directory` で可能にする。
 */

/**
 * 先頭の並び替え用プレフィックスにマッチする。
 * 「1 文字以上の数字」＋「区切り（`-` `_` `.` または空白）1 文字以上」。
 * 区切りが無いもの（`3dprinting` など）は誤って削らない。
 */
const ORDER_PREFIX = /^\d+[-_.\s]+/;

/**
 * 表示名から並び替え用の数値プレフィックスを除去する。
 * 例: `01_setup` → `setup`、`001-getting-started` → `getting-started`、`01. 概要` → `概要`。
 * 除去後が空になる場合（`01_` など）は元の文字列をそのまま返す。
 */
export function stripOrderPrefix(name: string): string {
  const stripped = name.replace(ORDER_PREFIX, "");
  return stripped.length > 0 ? stripped : name;
}

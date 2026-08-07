/**
 * PDF のヘッダ・フッタ帯（Chromium の `displayHeaderFooter`）。
 *
 * 帯は Chromium に渡す HTML フラグメントで、monodocs のテンプレート言語ではない。Chromium は
 * 自前のクラスを持つ要素へ値を差し込むので、`{{pageNumber}}` のような独自トークンは導入しない。
 * すでに HTML である以上、置換とエスケープの層をもう一段仕様化して保守する利得が無い。
 */

/** Chromium が値を差し込むクラス。置き換えフラグメントが使えるのはこれだけ。 */
export const CHROMIUM_BAND_CLASSES = ["pageNumber", "totalPages", "title", "date", "url"] as const;

/**
 * 既定のフッタ。ページ番号と総ページ数だけを中央に置く。
 *
 * 文言を持たないのが意図。monodocs が全ページに足す唯一のテキストなので、数字と区切りだけに
 * しておけば、これ自体を翻訳する必要が無い（23.4 のラベルとは別の層になる）。
 *
 * 帯は文書のスタイルを一切継承しないため、フォントと大きさは自分で指定する。指定しないと
 * Chromium の素の既定になり、本文とかけ離れた見た目になる。
 */
/**
 * 端からの余白は margin ではなく border-box の padding で取る。`width:100%` に左右 margin を
 * 足すと、内容ボックスは帯の幅そのままに右へずれてはみ出し、その中で中央揃えされるので、
 * 紙の中央からずれる。実測で 15pt ぶん（20px）右にずれていた。padding なら inset として効く。
 */
export const DEFAULT_PDF_FOOTER =
  '<div style="width:100%;box-sizing:border-box;padding:0 15pt;font-family:sans-serif;' +
  'font-size:8pt;color:#666;text-align:center;">' +
  '<span class="pageNumber"></span> / <span class="totalPages"></span></div>';

/**
 * 帯を出さないときに渡すフラグメント。**省略ではなく空を明示する**のが要点で、
 * `displayHeaderFooter` を有効にしたまま何も渡さないと、Chromium は自前の組み込みヘッダ
 * （日付と文書タイトル）へフォールバックする。「出さない」と指定した結果が
 * 「頼んでいないものが出る」になってしまう。
 */
export const EMPTY_PDF_BAND = "<span></span>";

/** 設定値（`false` = 帯なし / 文字列 = 置き換え / 未指定 = 既定）をフラグメントへ解決する。 */
export function resolveBand(value: string | false | undefined, fallback: string): string {
  if (value === false) return EMPTY_PDF_BAND;
  if (value === undefined) return fallback;
  return value;
}

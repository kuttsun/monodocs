/** HTML テキストノード用のエスケープ。 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** HTML 属性値用のエスケープ。 */
export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

/**
 * 設定由来の UI ラベルをテンプレートへ埋めるためのエスケープ。
 *
 * ラベルは行き先が 1 つに決まらない。既定テンプレートでは属性値（`title` / `aria-label`）と
 * テキストノード（目次見出し、フッター）の両方に出るうえ、カスタムテンプレートがどちらに
 * 置くかは分からない。そこで両方で安全な形にまとめる。属性用のエスケープはテキストノードでも
 * 正しく表示され（`&quot;` は `"` として描画される）、逆は成り立たない。
 *
 * 単引用符まで落とすのは、`title='{{labelX}}'` と書いたカスタムテンプレートで属性から
 * 抜け出せてしまうため。設定ファイルのキーを injection point にしない。
 */
export function escapeLabel(value: string): string {
  return escapeAttr(value).replace(/'/g, "&#39;");
}

/**
 * テンプレートの `{{token}}` をまとめて置換する。
 *
 * 1 回の走査で置換するのが要点。トークンごとに順番に置換すると、先に埋め込んだ内容
 * （本文 HTML・テーマの CSS / JS）に含まれる `{{...}}` らしき文字列が、後続の置換で
 * さらに書き換えられてしまう（例: トークン一覧を説明するドキュメントページ、
 * `{{bodyScripts}}` という文字列を含むテーマの app.js）。
 *
 * 値は関数コールバックで返すため、`$&` などの置換パターンとして解釈されない。
 * 未知のトークンはテンプレートに書かれたまま残す（テーマ側の別テンプレート記法を壊さない）。
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name]! : match,
  );
}

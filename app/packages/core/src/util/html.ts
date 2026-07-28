/** HTML テキストノード用のエスケープ。 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** HTML 属性値用のエスケープ。 */
export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
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

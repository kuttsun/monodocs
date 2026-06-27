/** HTML テキストノード用のエスケープ。 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** HTML 属性値用のエスケープ。 */
export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

/**
 * テンプレート内のトークンを置換する。
 * String.replaceAll は置換文字列中の `$&` などを特殊解釈するため、
 * CSS / JS をそのまま埋め込めるよう split/join で置換する。
 */
export function injectToken(template: string, token: string, value: string): string {
  return template.split(token).join(value);
}

import { escapeAttr, escapeHtml } from "../util/html.js";

/**
 * `pdf.watermark` (roadmap 24.10): one line of text, diagonal, reading as behind the content, on
 * every printed sheet — in the PDF and when the HTML is printed from a browser — and nowhere on
 * screen.
 *
 * The rule is core's, appended to whatever stylesheet the theme supplies, for the reason the
 * density and page-break rules are: a theme replacing `style.css` must not be able to delete
 * "CONFIDENTIAL" from a document that asked for it.
 *
 * There is deliberately nothing to configure but the text (24.6's closed key set). Size follows the
 * text's length so that a long line still fits across the sheet, and the colour is a light grey
 * that survives a photocopier without hiding what it covers.
 */

/**
 * The text as a CSS string literal. Every character outside a plain safe set is written as a
 * hexadecimal escape, so neither a quote, a backslash, a newline, nor `</style>` can end the string
 * or the style element it sits in: the value reaches the output as text, never as markup or CSS.
 */
export function cssString(text: string): string {
  let out = "";
  for (const ch of text) {
    out += /^[\p{L}\p{N} .,:;!?()\-_+*#%@/]$/u.test(ch)
      ? ch
      : `\\${ch.codePointAt(0)!.toString(16)} `;
  }
  return `"${out}"`;
}

/**
 * The text's width in em, roughly: a wide (CJK) character is about one em, anything else about
 * half to two thirds of one. Only used to scale the font so the line fits the sheet's diagonal.
 */
function emWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += WIDE.test(ch) || ch.codePointAt(0)! > 0xffff ? 1 : 0.62;
  return Math.max(width, 1);
}

/** Hangul Jamo, CJK and Hangul syllables, compatibility ideographs, and fullwidth forms. */
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60\uFFE0-\uFFE6]/;

/**
 * The default theme's body stack. `html::after` does not inherit the body's font, and left to the
 * browser's default it comes out in a serif; for CJK the stack is also what has the glyphs.
 */
const WATERMARK_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Kaku Gothic ProN", "Hiragino Sans", ' +
  "Meiryo, sans-serif";

/**
 * The print rule for a watermark.
 *
 * `position: fixed` is what makes Chromium draw the box on every sheet. It is painted above the
 * content and multiplied into it rather than placed underneath with a negative `z-index`: measured,
 * underneath is behind any background a theme paints on `html` or on a content wrapper, so a theme
 * that gives `#content` a white background would erase the watermark, which 24.10 says a theme must
 * not be able to do. Multiplied, a light grey darkens white paper and leaves dark ink as it was, so
 * it reads as behind the text while nothing can cover it.
 *
 * `html::after` rather than `body::after`, because the default theme already uses `body::after` for
 * the drawer's overlay, and a more specific selector there would win on paper. Every declaration is
 * `!important`: a theme's print rule that hides generated content (`*::after { display: none }`)
 * must not take the watermark with it, and an important declaration with a more specific selector
 * wins against one with `!important` too.
 */
export function watermarkRules(text: string): string {
  // About 1.2 times the sheet's shorter side, which the diagonal comfortably holds; capped so a
  // one-word watermark does not fill the page.
  const size = `min(110pt, calc(120vmin / ${emWidth(text).toFixed(2)}))`;
  return `@media print {
  html::after {
    content: ${cssString(text)} !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    background: none !important;
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    z-index: 2147483647 !important;
    transform: translate(-50%, -50%) rotate(-35deg) !important;
    font-family: ${WATERMARK_FONT_FAMILY} !important;
    font-size: ${size} !important;
    font-weight: 700 !important;
    line-height: 1 !important;
    white-space: pre !important;
    color: rgb(212, 212, 212) !important;
    mix-blend-mode: multiply !important;
    pointer-events: none !important;
  }
}
`;
}

/**
 * The watermark as a fragment for the font check, set in the font it prints in. The check walks the
 * document's text and does not see generated content, so without this a watermark in a script the
 * build machine has no font for would print as tofu on every sheet unreported.
 */
export function watermarkProbe(text: string): string {
  return (
    `<span style="${escapeAttr(`font-family:${WATERMARK_FONT_FAMILY};font-weight:700`)}">` +
    `${escapeHtml(text)}</span>`
  );
}

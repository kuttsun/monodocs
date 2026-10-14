import { readFile } from "node:fs/promises";
import { t } from "../messages.js";
import { BrowserSetupError } from "../pipeline/browser.js";

/**
 * The math font monodocs carries for the PDF (roadmap 6.4, v0.17): New Computer Modern Math, Book
 * weight, unmodified from CTAN (`fonts/README.md`). It is put only into the page a PDF is printed
 * from, and only when the document has a formula, so the HTML and a PDF with no formula are as
 * before.
 */
export const MATH_FONT_FILE = "NewCMMath-Book.otf";

/** The family the font is declared under, which no installed font can answer to. */
export const MATH_FONT_FAMILY = "monodocs carried math";

/**
 * Mermaid's own test for a label with a formula (`katexRegex` in mermaid's `common.ts`): `$$…$$`
 * within one line.
 */
const MERMAID_FORMULA = /\$\$(.*?)\$\$/;

/** Whether a Mermaid diagram's source has a label that mermaid renders as a formula. */
export function mermaidHasFormula(code: string): boolean {
  return code.split("\n").some((line) => MERMAID_FORMULA.test(line));
}

/**
 * Whether a document has a formula: a `<math>` (a pre-rendered diagram's labels included), or a
 * diagram the browser has yet to draw whose source has one. The source is HTML-escaped there, which
 * leaves `$` and line breaks as they are.
 */
export function htmlHasFormula(html: string): boolean {
  if (/<math[\s>]/i.test(html)) return true;
  for (const block of html.matchAll(/<pre class="mermaid"[^>]*>([\s\S]*?)<\/pre>/g)) {
    if (mermaidHasFormula(block[1]!)) return true;
  }
  return false;
}

/**
 * The font file, base64-encoded. It is beside this module: under `themes/fonts/` in the source and in
 * `dist`, and under `dist/fonts/` beside the bundle, which `import.meta.url` stands for there. The
 * single executable does not carry it, and cannot write a PDF either.
 */
export async function loadMathFont(): Promise<string> {
  try {
    return (await readFile(new URL(`./fonts/${MATH_FONT_FILE}`, import.meta.url))).toString(
      "base64",
    );
  } catch {
    throw new BrowserSetupError(t("pdf.mathFontFailed", { file: MATH_FONT_FILE }));
  }
}

/**
 * What goes at the top of `<head>` to set formulas in the carried font.
 *
 * The font is given to the browser as data through `FontFace`, which Chromium has loaded by the time
 * the constructor returns, so nothing laid out after it — a label the page's own Mermaid draws on
 * load included — is laid out in another font first. A stylesheet's `@font-face` would load only
 * once something asked for it, after the first layout. The script records the font's status, which
 * {@link assertMathFontLoaded} reads.
 *
 * The rule has no specificity (`:where`), so it replaces only the browser's own `math { font-family:
 * math }`: a theme that names a font for `math` keeps it, and that font is then what the font check
 * measures.
 */
export function mathFontHead(base64: string): string {
  return (
    `<script>(function(){try{var b=atob("${base64}"),u=new Uint8Array(b.length);` +
    `for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);` +
    `var f=new FontFace(${JSON.stringify(MATH_FONT_FAMILY)},u);document.fonts.add(f);` +
    `window.__monodocsMathFont=f.status;}catch(e){window.__monodocsMathFont="error";}})();</script>` +
    `<style>:where(math){font-family:"${MATH_FONT_FAMILY}",math;}</style>`
  );
}

/** Puts {@link mathFontHead} first in the document's `<head>`, or first in the document without one. */
export function withMathFont(html: string, head: string): string {
  const open = /<head(\s[^>]*)?>/i.exec(html);
  const at = open
    ? open.index + open[0].length
    : (/^\s*<!doctype[^>]*>/i.exec(html)?.[0].length ?? 0);
  return html.slice(0, at) + head + html.slice(at);
}

/**
 * Fails when a page given {@link mathFontHead} does not have the font. That is not the document's
 * fault, so it stops the build as a browser fault does, rather than printing formulas in whatever
 * the machine has.
 */
export async function assertMathFontLoaded(page: {
  evaluate(script: string): Promise<unknown>;
}): Promise<void> {
  if ((await page.evaluate("window.__monodocsMathFont")) !== "loaded") {
    throw new BrowserSetupError(t("pdf.mathFontFailed", { file: MATH_FONT_FILE }));
  }
}

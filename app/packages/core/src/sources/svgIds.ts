import type { Element } from "hast";

/**
 * Properties (hast names) whose value names one ID or several, space-separated. An SVG names its
 * own parts through them — a diagram's `aria-labelledby` names its `<title>` — so when the IDs are
 * renamed these must follow.
 */
const ID_REFERENCES = new Set([
  "htmlFor",
  "headers",
  "list",
  "form",
  "itemRef",
  "popoverTarget",
  "ariaLabelledBy",
  "ariaDescribedBy",
  "ariaControls",
  "ariaOwns",
  "ariaActiveDescendant",
  "ariaDetails",
  "ariaErrorMessage",
  "ariaFlowTo",
]);

/**
 * Properties that hold text for a reader, where `url(#…)` is words rather than a reference. Every
 * other string property may carry one (`fill`, `clip-path`, `style`, `values`, …).
 */
const TEXT_PROPERTIES = new Set([
  "title",
  "alt",
  "content",
  "placeholder",
  "ariaLabel",
  "ariaDescription",
  "ariaRoleDescription",
  "ariaValueText",
  "ariaPlaceholder",
]);

/** `url(#id)`, `url('#id')`, or `url("#id")`, with the ID captured. */
const URL_REFERENCE = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/gi;

/** One character of a CSS identifier as written: a name character, a non-ASCII one, or an escape. */
const IDENT_CHAR = /(?:[\w-]|[^\x00-\x7f]|\\[0-9a-fA-F]{1,6}[ \t\n\r\f]?|\\[^\n\r\f0-9a-fA-F])/y;

/** A character an identifier may start with. */
const IDENT_START = /[\w\-\\]|[^\x00-\x7f]/;

/**
 * An attribute selector on `id` whose value, where it is an ID, follows the renaming: an exact
 * match, a word in the list, or the start of the value (`[id=`, `[id~=`, `[id|=`, `[id^=`). A value
 * that is only part of an ID is left as written; `$=` and `*=` still match without renaming.
 */
const ID_ATTRIBUTE_SELECTOR = /\[\s*id\s*[~|^]?=\s*$/i;

/**
 * At-rules whose block holds rules rather than declarations, so an `#id` inside it can still be a
 * selector.
 */
const GROUPING_AT_RULES = /^@(?:media|supports|container|layer|document|scope|starting-style)\b/i;

/**
 * Rewrite every reference to an ID inside an SVG through `rename`, which returns the new name of
 * an ID, or undefined for one it does not know (that reference is left as written). The IDs
 * themselves are not touched: the caller renames them.
 *
 * What names an ID inside an SVG: `url(#…)` in any attribute and in `<style>`, `href` and
 * `xlink:href` starting with `#`, `#id` selectors in `<style>`, and the ID-naming attributes above.
 *
 * SMIL references are left as written. A `begin` or `end` names an element by its bare ID, and every
 * renamed ID holds a `-` that Chromium reads as the start of an offset (`a-r.click`), so renaming
 * one would not make it work.
 */
export function renameSvgReferences(
  svg: Element,
  rename: (id: string) => string | undefined,
): void {
  const one = (id: string) => rename(id) ?? id;
  const walk = (node: Element) => {
    for (const [key, value] of Object.entries(node.properties)) {
      if ((key === "href" || key === "xLinkHref") && typeof value === "string") {
        if (value.startsWith("#")) node.properties[key] = `#${one(value.slice(1))}`;
      } else if (ID_REFERENCES.has(key)) {
        node.properties[key] = Array.isArray(value)
          ? value.map((name) => one(String(name)))
          : typeof value === "string"
            ? value.split(/\s+/).map(one).join(" ")
            : value;
      } else if (
        typeof value === "string" &&
        /url\(/i.test(value) &&
        !TEXT_PROPERTIES.has(key) &&
        !key.startsWith("data")
      ) {
        node.properties[key] = renameUrls(value, rename);
      }
    }
    // A comment inside `<style>` splits its text; the stylesheet is still one, so the scanner's
    // place in it carries across the pieces.
    const sheet: SheetState = { blocks: [], prelude: "" };
    for (const child of node.children) {
      if (child.type === "element") walk(child);
      else if (child.type === "text" && node.tagName === "style") {
        child.value = renameInStylesheet(child.value, rename, sheet);
      }
    }
  };
  walk(svg);
}

/**
 * Rename the IDs a stylesheet names: `#id` where it is a selector, and `url(#id)` anywhere. A `#…`
 * inside a declaration block is a colour (`fill: #bad`), and one in a string or a comment is text;
 * neither is touched, so an ID that happens to be spelled like a colour does not break one.
 */
function renameInStylesheet(
  css: string,
  rename: (id: string) => string | undefined,
  sheet: SheetState,
): string {
  let out = "";
  let i = 0;
  const { blocks } = sheet;
  let prelude = sheet.prelude;
  const inRules = () => blocks.length === 0 || blocks[blocks.length - 1] === true;
  // An at-rule's own prelude (`@supports (fill: #abc)`) holds values, not selectors, except where
  // it names a selector: `@scope (#r)`, `@supports selector(#r)`.
  const inSelector = () => {
    if (!inRules()) return false;
    const head = prelude.trimStart();
    return !head.startsWith("@") || /^@scope\b/i.test(head) || /selector\([^)]*$/i.test(head);
  };
  while (i < css.length) {
    const c = css[i]!;
    if (inSelector() && ID_ATTRIBUTE_SELECTOR.test(prelude) && IDENT_START.test(c)) {
      // An unquoted value: `[id=r]`, `[id=\\31 0]`.
      const j = identEnd(css, i);
      const renamed = rename(unescapeIdent(css.slice(i, j)));
      const token = renamed === undefined ? css.slice(i, j) : escapeIdent(renamed);
      out += token;
      prelude += token;
      i = j;
    } else if (c === "\\") {
      // An escaped character is part of a name (`.a\#r` is the class `a#r`), never a delimiter.
      out += css.slice(i, i + 2);
      prelude += css.slice(i, i + 2);
      i += 2;
    } else if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? css.length : end + 2;
      out += css.slice(i, stop);
      i = stop;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c && css[j] !== "\n") j += css[j] === "\\" ? 2 : 1;
      const stop = Math.min(j + 1, css.length);
      let token = css.slice(i, stop);
      // `[href="#r"]` selects what an `href` names, and the `href` itself is renamed.
      // `[id="r"]` selects the element whose ID is renamed.
      const target = /^(['"])#(.+)\1$/.exec(token);
      const idValue = /^(['"])(.+)\1$/.exec(token);
      if (
        target &&
        inRules() &&
        /\[\s*(?:[\w-]*\|)?(?:xlink\\?:)?href\s*[~|^$*]?=\s*$/i.test(prelude)
      ) {
        const renamed = rename(unescapeIdent(target[2]!));
        if (renamed !== undefined) token = `${target[1]}#${renamed}${target[1]}`;
      } else if (idValue && inRules() && ID_ATTRIBUTE_SELECTOR.test(prelude)) {
        const renamed = rename(unescapeIdent(idValue[2]!));
        if (renamed !== undefined) token = `${idValue[1]}${renamed}${idValue[1]}`;
      }
      out += token;
      prelude += token;
      i = stop;
    } else if (/^url\(/i.test(css.slice(i, i + 4))) {
      // A quoted URL may hold a `)` of its own (`url("data:x,rgb(0,0,0)")`): skip the string first.
      let j = i + 4;
      while (j < css.length && /\s/.test(css[j]!)) j += 1;
      const quote = css[j];
      if (quote === '"' || quote === "'") {
        j += 1;
        while (j < css.length && css[j] !== quote && css[j] !== "\n") j += css[j] === "\\" ? 2 : 1;
      }
      const end = css.indexOf(")", j);
      const stop = end === -1 ? css.length : end + 1;
      const token = css.slice(i, stop);
      out += renameUrls(token, rename);
      i = stop;
    } else if (c === "#" && inSelector()) {
      const j = identEnd(css, i + 1);
      const written = css.slice(i + 1, j);
      const renamed = written === "" ? undefined : rename(unescapeIdent(written));
      const token = renamed === undefined ? css.slice(i, j) : `#${escapeIdent(renamed)}`;
      out += token;
      prelude += token;
      i = j;
    } else {
      if (c === "{") {
        // A grouping at-rule nested in a declaration block (CSS nesting) holds declarations too.
        blocks.push(inRules() && GROUPING_AT_RULES.test(prelude.trim()));
        prelude = "";
      } else if (c === "}") {
        blocks.pop();
        prelude = "";
      } else if (c === ";") {
        prelude = "";
      } else {
        prelude += c;
      }
      out += c;
      i += 1;
    }
  }
  sheet.prelude = prelude;
  return out;
}

/**
 * Where a stylesheet scan stands: one entry per open block, true where the block holds rules (the
 * top level, `@media`), so a `#id` in it is a selector, false where it holds declarations; and the
 * text since the last `{`, `}`, or `;`.
 */
type SheetState = { blocks: boolean[]; prelude: string };

/** Rename the IDs `url(#…)` names in a value, writing each so the URL reads back as it was meant. */
function renameUrls(value: string, rename: (id: string) => string | undefined): string {
  return value.replace(URL_REFERENCE, (whole, quote: string, id: string) => {
    const renamed = rename(unescapeIdent(id));
    if (renamed === undefined) return whole;
    // Unquoted, a parenthesis, a quote, a backslash, or a space would end or break the URL.
    const written =
      quote === ""
        ? renamed.replace(/[()'"\\]|\s/g, (ch) =>
            /\s/.test(ch) ? `\\${ch.codePointAt(0)!.toString(16)} ` : `\\${ch}`,
          )
        : renamed.replace(/[\\\n]|['"]/g, (ch) => (ch === quote || ch === "\\" ? `\\${ch}` : ch));
    return `url(${quote}#${written}${quote})`;
  });
}

/** Where the identifier starting at `from` ends. */
function identEnd(css: string, from: number): number {
  let j = from;
  for (;;) {
    IDENT_CHAR.lastIndex = j;
    if (!IDENT_CHAR.test(css)) return j;
    j = IDENT_CHAR.lastIndex;
  }
}

/** The identifier a CSS escape sequence spells: `a\:b` → `a:b`, `\31 0` → `10`. */
function unescapeIdent(written: string): string {
  return written.replace(
    /\\(?:([0-9a-fA-F]{1,6})[ \t\n\r\f]?|(.))/g,
    (_, hex?: string, ch?: string) =>
      hex === undefined ? ch! : String.fromCodePoint(Number.parseInt(hex, 16)),
  );
}

/** An identifier written so CSS reads it back unchanged, as `CSS.escape` would, which Node lacks. */
function escapeIdent(id: string): string {
  let out = "";
  for (const [index, ch] of [...id].entries()) {
    const code = ch.codePointAt(0)!;
    if (code === 0) out += "�";
    else if (
      (code >= 0x1 && code <= 0x1f) ||
      code === 0x7f ||
      (index === 0 && ch >= "0" && ch <= "9") ||
      (index === 1 && ch >= "0" && ch <= "9" && id.startsWith("-"))
    ) {
      out += `\\${code.toString(16)} `;
    } else if (code >= 0x80 || /[\w-]/.test(ch)) out += ch;
    else out += `\\${ch}`;
  }
  return out;
}

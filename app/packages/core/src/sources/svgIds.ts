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

/** `url(#id)`, `url('#id')`, or `url("#id")`, with the ID captured. */
const URL_REFERENCE = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g;

/** A `#id` selector in a stylesheet. The ID runs to the first character an ID selector cannot hold. */
const ID_SELECTOR = /#((?:[\w-]|\\.)+)/g;

/**
 * Rewrite every reference to an ID inside an SVG through `rename`, which returns the new name of
 * an ID, or undefined for one it does not know (that reference is left as written). The IDs
 * themselves are not touched: the caller renames them.
 *
 * What names an ID inside an SVG: `url(#…)` in any attribute and in `<style>`, `href` and
 * `xlink:href` starting with `#`, `#id` selectors in `<style>`, and the ID-naming attributes above.
 */
export function renameSvgReferences(
  svg: Element,
  rename: (id: string) => string | undefined,
): void {
  const one = (id: string) => rename(id) ?? id;
  const urls = (value: string) =>
    value.replace(URL_REFERENCE, (whole, quote: string, id: string) => {
      const renamed = rename(id);
      return renamed === undefined ? whole : `url(${quote}#${renamed}${quote})`;
    });
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
      } else if (typeof value === "string" && value.includes("url(")) {
        node.properties[key] = urls(value);
      }
    }
    for (const child of node.children) {
      if (child.type === "element") walk(child);
      else if (child.type === "text" && node.tagName === "style") {
        // url() first, and a `#id` inside a url() is not taken for a selector and renamed twice.
        child.value = urls(child.value).replace(
          ID_SELECTOR,
          (whole, id: string, at: number, all: string) =>
            insideUrl(all, at) ? whole : `#${one(id)}`,
        );
      }
    }
  };
  walk(svg);
}

/** Whether position `at` of a stylesheet falls inside a `url(…)`. */
function insideUrl(css: string, at: number): boolean {
  const open = css.lastIndexOf("url(", at);
  return open !== -1 && css.indexOf(")", open) > at;
}

import { toText } from "hast-util-to-text";
import { visit } from "unist-util-visit";
import type { Root as HastRoot } from "hast";
import { type Diagnostic, warn } from "../diagnostics.js";
import { t } from "../messages.js";
import type { Page } from "../types.js";

/**
 * Checks over a page that is already built, decidable from what the pipeline holds (roadmap.md
 * 25.5).
 *
 * They run where every other finding is made — in post-processing, over the same tree — so that
 * `validate` and `build` report the same thing rather than each owning a check the other does not
 * run (architecture.md).
 *
 * Neither carries a line. The tree here is the rendered HTML, whose positions describe the
 * generated document rather than the file the author edits, and a line number pointing at the wrong
 * document is worse than none.
 */

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/**
 * A heading level skipped, an `h2` followed by an `h4`.
 *
 * It breaks the in-page table of contents (22) and every assistive technology that navigates by
 * level. The comparison is between consecutive headings only: the first heading of a page is never
 * a finding, because a page whose title comes from frontmatter legitimately opens at `h2`, and
 * calling that a skip would report most well-formed documents.
 */
export function checkHeadingLevels(tree: HastRoot, page: Page, diagnostics: Diagnostic[]): void {
  let previous: number | undefined;
  visit(tree, "element", (node) => {
    if (!HEADINGS.has(node.tagName)) return;
    const level = Number(node.tagName.slice(1));
    if (previous !== undefined && level > previous + 1) {
      diagnostics.push(
        warn(
          "heading/level-skipped",
          t("check.headingLevelSkipped", {
            title: toText(node).trim(),
            from: previous,
            to: level,
            path: page.relativePath,
          }),
          { path: page.relativePath },
        ),
      );
    }
    previous = level;
  });
}

/**
 * An image with no `alt` attribute at all.
 *
 * `alt=""` is not a finding: it is how an author marks an image as decorative, and the lightbox
 * already honours that distinction (23.2). Reporting it would push authors towards writing
 * something — anything — into the attribute, which is worse for a reader using a screen reader than
 * the empty string that says "skip me".
 */
export function checkImageAlt(tree: HastRoot, page: Page, diagnostics: Diagnostic[]): void {
  visit(tree, "element", (node) => {
    if (node.tagName !== "img") return;
    if (typeof node.properties.alt === "string") return;
    const src = typeof node.properties.src === "string" ? node.properties.src : "";
    diagnostics.push(
      warn("image/no-alt", t("check.imageNoAlt", { src, path: page.relativePath }), {
        path: page.relativePath,
      }),
    );
  });
}

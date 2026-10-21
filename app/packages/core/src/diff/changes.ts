import type { Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import type { DiffLabels } from "../labels.js";
import type { Page, SidebarNode } from "../types.js";
import { escapeAttr, escapeHtml } from "../util/html.js";
import { blocksOf } from "./blocks.js";
import type { PageComparison } from "./compare.js";
import { writeDifference, type WriteOptions } from "./write.js";

/**
 * The document a difference is read in (roadmap 7.3.4): the list of changes as its first page, a
 * note at the top of each page whose change no block carries, and each page's state.
 */

/** What became of a page of the new version. */
export type PageState = "added" | "moved" | "changed";

/** The route of the list of changes: no route built from a path has an empty segment (15.1). */
export const CHANGES_ROUTE = "//changes";

/** What a note at the top of a page is written with, for the stylesheet and the navigation. */
export const NOTE_CLASS = "monodocs-diff-note";

/** The difference as the rendered document carries it. */
export type DiffDocument = {
  /** The list of changes, then the new version's pages, their notes written into them. */
  pages: Page[];
  /** The new version's sidebar with the list of changes first, unnumbered. */
  sidebar: SidebarNode[];
  /** Each page of the new version that changed, by page ID. */
  states: Map<string, PageState>;
  /** The labels the difference uses, resolved. */
  labels: DiffLabels;
  /** The page ID the list of changes was given. */
  changesPageId: string;
  /** How many deleted diagrams the list of changes holds, from the deleted pages. */
  deletedDiagrams: number;
};

/** The two versions' names, as the list of changes' title shows them. */
export type VersionNames = { from?: string; to?: string };

/**
 * A page ID for the list of changes that no page has, whose article ID no element has, and that no
 * element ID starts with as a page's own do (`{id}-`), so its own IDs collide with none. Tried in a
 * fixed order, so the same input gives the same ID.
 */
export function changesPageId(pageIds: Iterable<string>, elementIds: Iterable<string>): string {
  const pages = new Set(pageIds);
  const elements = [...elementIds];
  for (let id = "diff-changes"; ; id += "-x") {
    if (pages.has(id)) continue;
    if (elements.some((e) => e === id || e === `page-${id}` || e.startsWith(`${id}-`))) continue;
    return id;
  }
}

/** The pages of `sidebar` in its order, then the pages it leaves out in theirs. */
function inSidebarOrder(pages: readonly Page[], sidebar: readonly SidebarNode[]): Page[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const out: Page[] = [];
  const seen = new Set<string>();
  const walk = (nodes: readonly SidebarNode[]) => {
    for (const node of nodes) {
      if (node.type === "dir") walk(node.children);
      else {
        const page = byId.get(node.pageId);
        if (page !== undefined && !seen.has(page.id)) {
          seen.add(page.id);
          out.push(page);
        }
      }
    }
  };
  walk(sidebar);
  for (const page of pages) if (!seen.has(page.id)) out.push(page);
  return out;
}

function link(page: Page): string {
  return `<a href="#${escapeAttr(encodeURI(page.route))}">${escapeHtml(page.title)}</a>`;
}

/** A note at the top of a page: its lines, each a label with what code puts next to it. */
function note(lines: string[]): string {
  return `<div class="${NOTE_CLASS}">${lines.map((line) => `<p>${line}</p>`).join("")}</div>\n`;
}

/**
 * Write the difference into the new version's pages and compose the list of changes. `next` and
 * `old` are each version's pages, sidebar, and trees; the trees of the changed pages are written into
 * and their HTML serialised again.
 */
export function writeDiffDocument(
  comparison: readonly PageComparison[],
  next: { pages: Page[]; sidebar: SidebarNode[] },
  old: {
    pages: readonly Page[];
    sidebar: readonly SidebarNode[];
    trees: ReadonlyMap<string, HastRoot>;
  },
  context: {
    labels: DiffLabels;
    names: VersionNames;
    write: WriteOptions;
    /** Every element ID of the new version's pages, which the list of changes' ID avoids. */
    elementIds: Iterable<string>;
  },
): DiffDocument {
  const { labels } = context;
  const states = new Map<string, PageState>();
  const added: Page[] = [];
  const moved = new Map<string, PageComparison & { state: "matched" }>();
  const changed = new Map<string, PageComparison & { state: "matched" }>();
  const deleted = new Map<string, PageComparison & { state: "deleted" }>();
  let unchanged = 0;

  for (const page of comparison) {
    if (page.state === "added") {
      states.set(page.new.id, "added");
      added.push(page.new);
      page.new.html = note([escapeHtml(labels.diffPageAdded)]) + page.new.html;
    } else if (page.state === "deleted") {
      deleted.set(page.old.id, page);
    } else if (page.movedFrom !== undefined) {
      states.set(page.new.id, "moved");
      moved.set(page.new.id, page);
    } else if (page.changed) {
      states.set(page.new.id, "changed");
      changed.set(page.new.id, page);
    } else unchanged++;
  }
  // A moved page's note names its earlier route; a page whose front-matter title changed shows the
  // earlier one. Written after its blocks, at the top of the page.
  for (const page of [...moved.values(), ...changed.values()]) {
    const lines: string[] = [];
    if (page.movedFrom !== undefined) {
      lines.push(`${escapeHtml(labels.diffPageMoved)} <code>${escapeHtml(page.movedFrom)}</code>`);
    }
    if (page.titleChanged !== undefined) {
      lines.push(
        `${escapeHtml(labels.diffTitleChanged)} ${escapeHtml(page.titleChanged.from ?? page.old.title)}`,
      );
    }
    if (lines.length > 0) page.new.html = note(lines) + page.new.html;
  }

  const id = changesPageId([...next.pages.map((page) => page.id)], context.elementIds);
  const counts = (page: PageComparison) => {
    const edits = page.edits ?? [];
    const plus = edits.filter((edit) => edit.op === "insert").length;
    const minus = edits.filter((edit) => edit.op === "delete").length;
    return ` — ${escapeHtml(labels.diffAdded)} ${plus} / ${escapeHtml(labels.diffDeleted)} ${minus}`;
  };
  const sections: string[] = [];
  const headings: Page["headings"] = [];
  const section = (key: string, label: string, body: string) => {
    const sectionId = `${id}-${key}`;
    headings.push({ level: 2, id: sectionId, text: label });
    sections.push(`<h2 id="${sectionId}">${escapeHtml(label)}</h2>\n${body}`);
  };
  const list = (items: string[]) =>
    `<ul>\n${items.map((item) => `<li>${item}</li>`).join("\n")}\n</ul>`;
  const ordered = inSidebarOrder(next.pages, next.sidebar);

  const addedPages = ordered.filter((page) => states.get(page.id) === "added");
  if (addedPages.length > 0) section("added", labels.diffAddedPages, list(addedPages.map(link)));
  const movedPages = ordered.flatMap((page) => moved.get(page.id) ?? []);
  if (movedPages.length > 0) {
    section(
      "moved",
      labels.diffMovedPages,
      list(
        movedPages.map(
          (page) =>
            `${link(page.new)} (<code>${escapeHtml(page.movedFrom!)}</code> → <code>${escapeHtml(page.new.route)}</code>)` +
            (page.changed ? counts(page) : ""),
        ),
      ),
    );
  }
  const changedPages = ordered.flatMap((page) => changed.get(page.id) ?? []);
  if (changedPages.length > 0) {
    section(
      "changed",
      labels.diffChangedPages,
      list(
        changedPages.map(
          (page) =>
            link(page.new) +
            (page.titleChanged === undefined
              ? ""
              : ` (${escapeHtml(labels.diffTitleChanged)} ${escapeHtml(page.titleChanged.from ?? page.old.title)})`) +
            counts(page),
        ),
      ),
    );
  }
  const deletedPages = inSidebarOrder(old.pages, old.sidebar).flatMap(
    (page) => deleted.get(page.id) ?? [],
  );
  let deletedDiagrams = 0;
  if (deletedPages.length > 0) {
    const parts = deletedPages.map((page, i) => {
      const tree = old.trees.get(page.old.id);
      let content = "";
      if (tree !== undefined) {
        const target: HastRoot = { type: "root", children: [] };
        const blocks = blocksOf(tree, page.old.id);
        deletedDiagrams += writeDifference(
          target,
          tree,
          blocks.map((block) => ({ op: "delete" as const, old: block })),
          context.write,
        );
        content = toHtml(target, { allowDangerousHtml: true });
      }
      const headingId = `${id}-deleted-${i + 1}`;
      headings.push({ level: 3, id: headingId, text: page.old.title });
      const merged =
        page.mergedInto === undefined
          ? ""
          : `<p>${escapeHtml(labels.diffMergedInto)} ${link(page.mergedInto)}</p>\n`;
      return `<h3 id="${headingId}">${escapeHtml(page.old.title)}</h3>\n${merged}${content}`;
    });
    section("deleted", labels.diffDeletedPages, parts.join("\n"));
  }
  const nothing = states.size === 0 && deleted.size === 0;
  const tail =
    `<p>${escapeHtml(labels.diffUnchangedPages)} ${unchanged}</p>` +
    (nothing ? `\n<p>${escapeHtml(labels.diffNoChanges)}</p>` : "");

  const title = changesTitle(labels.diffChanges, context.names);
  const page: Page = {
    id,
    route: CHANGES_ROUTE,
    sourcePath: "",
    relativePath: "",
    format: "markdown",
    title,
    hidden: true,
    aliases: [],
    rawSource: "",
    html: `<h1 id="${id}">${escapeHtml(title)}</h1>\n${[...sections, tail].join("\n")}`,
    text: "",
    headings: [{ level: 1, id, text: title }, ...headings],
    anchors: [id, ...headings.map((heading) => heading.id)],
    links: [],
    assets: [],
  };
  return {
    pages: [page, ...next.pages],
    sidebar: [{ type: "page", title, route: CHANGES_ROUTE, pageId: id }, ...next.sidebar],
    states,
    labels,
    changesPageId: id,
    deletedDiagrams,
  };
}

/**
 * The list of changes' title: the label, then `from → to`. Whichever version has no name is left
 * out with the arrow; with neither, the title is the label alone.
 */
export function changesTitle(label: string, names: VersionNames): string {
  const from = names.from?.trim() || undefined;
  const to = names.to?.trim() || undefined;
  if (from !== undefined && to !== undefined) return `${label} ${from} → ${to}`;
  const one = from ?? to;
  return one === undefined ? label : `${label} ${one}`;
}

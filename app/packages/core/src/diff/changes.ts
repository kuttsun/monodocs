import type { Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import { visit } from "unist-util-visit";
import type { DiffLabels } from "../labels.js";
import type { Page, SidebarNode } from "../types.js";
import { escapeAttr, escapeHtml } from "../util/html.js";
import type { PageComparison } from "./compare.js";
import { earlierColumn, writeColumns, type WriteOptions } from "./write.js";

/**
 * The document a difference is read in (roadmap 7.3.4): the list of changes as its first page, each
 * changed page as two columns — the earlier page beside the new one — each deleted page as a page of
 * its own, a note at the top of a page whose change no block carries, and each page's state.
 */

/** What became of a page. */
export type PageState = "added" | "deleted" | "moved" | "changed";

/** The route of the list of changes: no route built from a path has an empty segment (15.1). */
export const CHANGES_ROUTE = "//changes";

/** What a deleted page's route starts with, its earlier route following, for the same reason. */
export const DELETED_ROUTE = "//deleted";

/** What a note at the top of a page or a column is written with. */
export const NOTE_CLASS = "monodocs-diff-note";

/** The two columns of a changed page, and each column. */
export const COLUMNS_CLASS = "monodocs-diff-columns";
export const EARLIER_CLASS = "monodocs-diff-earlier";
export const CURRENT_CLASS = "monodocs-diff-current";

/** The difference as the rendered document carries it. */
export type DiffDocument = {
  /** The list of changes, then the pages in reading order, each deleted one where it stood. */
  pages: Page[];
  /** The new version's sidebar with the list of changes first and the deleted pages in place. */
  sidebar: SidebarNode[];
  /**
   * The sidebar of each version's own view: the new version's, and the earlier version's in its
   * order and titles, each page linking to the page that shows it. Neither lists the list of
   * changes, which is the side-by-side view's.
   */
  sidebars: { current: SidebarNode[]; earlier: SidebarNode[] };
  /** Each page that changed, by page ID. */
  states: Map<string, PageState>;
  /** The labels the difference uses, resolved. */
  labels: DiffLabels;
  /** The page ID the list of changes was given. */
  changesPageId: string;
  /** How many of the earlier version's diagrams the earlier columns hold. */
  earlierDiagrams: number;
  /**
   * What search covers in the earlier version's view (7.3.4): the earlier version's pages in its
   * sidebar's order, each by the route of the page that shows it, as `siteDataJson` lists pages.
   * Their headings carry no ID, so a result opens the page.
   */
  earlierSearch: EarlierSearchPage[];
};

/** A page of the earlier version as search reads it. */
export type EarlierSearchPage = {
  route: string;
  title: string;
  hidden: false;
  headings: [];
  text: string;
  formulas?: { tex: string }[];
};

/** The two versions' names, as the list of changes' title shows them. */
export type VersionNames = { from?: string; to?: string };

/**
 * A page ID from `base` that no page has, whose article ID no element has, and that no element ID
 * starts with as a page's own do (`{id}-`), so its own IDs collide with none. Tried in a fixed
 * order, so the same input gives the same ID.
 */
export function allocatePageId(
  base: string,
  pageIds: Iterable<string>,
  elementIds: Iterable<string>,
): string {
  const pages = new Set(pageIds);
  const elements = [...elementIds];
  for (let id = base; ; id += "-x") {
    if (pages.has(id)) continue;
    if (elements.some((e) => e === id || e === `page-${id}` || e.startsWith(`${id}-`))) continue;
    return id;
  }
}

/** The list of changes' page ID (7.3.4). */
export function changesPageId(pageIds: Iterable<string>, elementIds: Iterable<string>): string {
  return allocatePageId("diff-changes", pageIds, elementIds);
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

/**
 * How many diagrams a column holds, wherever they stand — a table cell's included — so a build
 * drawing them in the browser brings the runtime.
 */
function diagramsIn(tree: HastRoot): number {
  let count = 0;
  visit(tree, "element", (node) => {
    const value = node.properties.className;
    if (Array.isArray(value) && value.includes("mermaid")) count++;
  });
  return count;
}

function link(page: Page): string {
  return `<a href="#${escapeAttr(encodeURI(page.route))}">${escapeHtml(page.title)}</a>`;
}

/** A note: its lines, each a label with what code puts next to it. */
function note(lines: string[]): string {
  return `<div class="${NOTE_CLASS}">${lines.map((line) => `<p>${line}</p>`).join("")}</div>\n`;
}

/**
 * A page's two columns, each under the name of its version: the earlier page, or a note, beside
 * the new page, or a note.
 */
function columns(
  heads: { earlier: string; current: string },
  earlier: string,
  current: string,
): string {
  return (
    `<div class="${COLUMNS_CLASS}">` +
    `<div class="${EARLIER_CLASS}">\n${heads.earlier}${earlier}\n</div>` +
    `<div class="${CURRENT_CLASS}">\n${heads.current}${current}\n</div>` +
    `</div>`
  );
}

/** A column's heading: its version's label, and the version's name when it has one. */
function columnHead(label: string, name: string | undefined): string {
  const named = name?.trim()
    ? ` <span class="monodocs-diff-version">${escapeHtml(name.trim())}</span>`
    : "";
  return `<p class="monodocs-diff-column-title">${escapeHtml(label)}${named}</p>\n`;
}

/** Put `entry` in the sidebar after the page's entry, wherever that is; false if there is none. */
function insertAfter(nodes: SidebarNode[], pageId: string, entry: SidebarNode): boolean {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (node.type === "page" && node.pageId === pageId) {
      nodes.splice(i + 1, 0, entry);
      return true;
    }
    if (node.type === "dir" && insertAfter(node.children, pageId, entry)) return true;
  }
  return false;
}

/** Whether the sidebar has an entry for the page. */
function inSidebar(nodes: readonly SidebarNode[], pageId: string): boolean {
  return nodes.some((node) =>
    node.type === "page" ? node.pageId === pageId : inSidebar(node.children, pageId),
  );
}

/** A copy of a sidebar, so the new version's own is left as it was. */
function copySidebar(nodes: readonly SidebarNode[]): SidebarNode[] {
  return nodes.map((node) =>
    node.type === "dir" ? { ...node, children: copySidebar(node.children) } : { ...node },
  );
}

/**
 * Write the difference into the document: each changed page's two columns, each deleted page, the
 * notes, and the list of changes. `next` and `old` are each version's pages, sidebar, and trees; the
 * changed pages' trees are written into and their HTML replaced.
 */
export function writeDiffDocument(
  comparison: readonly PageComparison[],
  next: { pages: Page[]; sidebar: SidebarNode[]; trees: ReadonlyMap<string, HastRoot> },
  old: {
    pages: readonly Page[];
    sidebar: readonly SidebarNode[];
    trees: ReadonlyMap<string, HastRoot>;
  },
  context: {
    labels: DiffLabels;
    names: VersionNames;
    write: WriteOptions;
    /** Every element ID of the document, which the generated pages' IDs avoid. */
    elementIds: Iterable<string>;
    /** Whether changed pages are written side by side; false when one column was written. */
    columns?: boolean;
  },
): DiffDocument {
  const { labels } = context;
  const heads = {
    earlier: columnHead(labels.diffViewEarlier, context.names.from),
    current: columnHead(labels.diffViewCurrent, context.names.to),
  };
  const html = (tree: HastRoot) => toHtml(tree, { allowDangerousHtml: true });
  const states = new Map<string, PageState>();
  const moved = new Map<string, PageComparison & { state: "matched" }>();
  const changed = new Map<string, PageComparison & { state: "matched" }>();
  const deleted = new Map<string, PageComparison & { state: "deleted" }>();
  const matchedOld = new Map<string, Page>();
  let unchanged = 0;
  let earlierDiagrams = 0;

  for (const page of comparison) {
    if (page.state === "added") {
      states.set(page.new.id, "added");
      page.new.html = columns(heads, note([escapeHtml(labels.diffPageAdded)]), page.new.html);
      continue;
    }
    if (page.state === "deleted") {
      deleted.set(page.old.id, page);
      continue;
    }
    matchedOld.set(page.old.id, page.new);
    if (page.movedFrom !== undefined) {
      states.set(page.new.id, "moved");
      moved.set(page.new.id, page);
    } else if (page.changed) {
      states.set(page.new.id, "changed");
      changed.set(page.new.id, page);
    } else {
      unchanged++;
      continue;
    }
    // A page whose blocks changed is written side by side; one only moved or retitled is not.
    const nextTree = next.trees.get(page.new.id);
    const oldTree = old.trees.get(page.old.id);
    const edits = page.edits ?? [];
    const sideBySide = context.columns !== false;
    if (
      sideBySide &&
      nextTree !== undefined &&
      oldTree !== undefined &&
      edits.some((e) => e.op !== "equal")
    ) {
      const earlier = writeColumns(nextTree, oldTree, edits, context.write);
      earlierDiagrams += diagramsIn(earlier);
      page.new.html = columns(heads, html(earlier), html(nextTree));
    }
  }

  // A moved page's note names its earlier route; a page whose front-matter title changed shows the
  // earlier one. At the top of the page, above its columns.
  const earlierTitle = (page: PageComparison & { state: "matched" }) =>
    page.titleChanged === undefined ? undefined : (page.titleChanged.from ?? page.old.title);
  for (const page of [...moved.values(), ...changed.values()]) {
    const lines: string[] = [];
    if (page.movedFrom !== undefined) {
      lines.push(`${escapeHtml(labels.diffPageMoved)} <code>${escapeHtml(page.movedFrom)}</code>`);
    }
    const title = earlierTitle(page);
    if (title !== undefined) {
      lines.push(`${escapeHtml(labels.diffTitleChanged)} ${escapeHtml(title)}`);
    }
    if (lines.length > 0) page.new.html = note(lines) + page.new.html;
  }

  const pageIds = new Set(next.pages.map((page) => page.id));
  const elementIds = [...context.elementIds];
  const id = changesPageId(pageIds, elementIds);
  pageIds.add(id);

  // Each deleted page, a page of its own where it stood in the earlier sidebar: after the nearest
  // page before it there that the new version still has, or first, after the list of changes.
  const pages = [...next.pages];
  const sidebar = copySidebar(next.sidebar);
  const earlierOrder = inSidebarOrder(old.pages, old.sidebar);
  const deletedPages: { entry: PageComparison & { state: "deleted" }; page: Page }[] = [];
  const deletedByOld = new Map<string, Page>();
  // The page each new page's deleted followers were last placed after, so they keep their order.
  const lastAfter = new Map<string, string>();
  let first = 0;
  earlierOrder.forEach((oldPage, index) => {
    const entry = deleted.get(oldPage.id);
    if (entry === undefined) return;
    const pageId = allocatePageId(`deleted-${oldPage.id}`, pageIds, elementIds);
    pageIds.add(pageId);
    const tree = old.trees.get(oldPage.id);
    let content = "";
    if (tree !== undefined) {
      const column = earlierColumn(tree, context.write);
      earlierDiagrams += diagramsIn(column);
      content = html(column);
    }
    const page: Page = {
      id: pageId,
      route: `${DELETED_ROUTE}${oldPage.route}`,
      sourcePath: "",
      relativePath: "",
      format: oldPage.format,
      title: oldPage.title,
      hidden: true,
      aliases: [],
      rawSource: "",
      html: columns(heads, content, note([escapeHtml(labels.diffPageDeleted)])),
      text: "",
      headings: [],
      anchors: [],
      links: [],
      assets: [],
    };
    states.set(pageId, "deleted");
    deletedPages.push({ entry, page });
    deletedByOld.set(oldPage.id, page);
    let anchor: Page | undefined;
    for (let i = index - 1; i >= 0 && anchor === undefined; i--) {
      const kept = matchedOld.get(earlierOrder[i]!.id);
      if (kept !== undefined && inSidebar(sidebar, kept.id)) anchor = kept;
    }
    const sidebarEntry: SidebarNode = {
      type: "page",
      title: page.title,
      route: page.route,
      pageId,
    };
    if (anchor === undefined) {
      sidebar.splice(first, 0, sidebarEntry);
      pages.splice(first, 0, page);
      first++;
      return;
    }
    const after = lastAfter.get(anchor.id) ?? anchor.id;
    insertAfter(sidebar, after, sidebarEntry);
    pages.splice(pages.findIndex((p) => p.id === after) + 1, 0, page);
    lastAfter.set(anchor.id, pageId);
  });

  // The list of changes.
  const counts = (page: PageComparison) => {
    const edits = page.edits ?? [];
    const plus = edits.filter((edit) => edit.op === "insert").length;
    const minus = edits.filter((edit) => edit.op === "delete").length;
    // A page changed only in its title has no block to count.
    if (plus === 0 && minus === 0) return "";
    return ` — ${escapeHtml(labels.diffAdded)} ${plus} / ${escapeHtml(labels.diffDeleted)} ${minus}`;
  };
  const withTitle = (page: PageComparison & { state: "matched" }) => {
    const title = earlierTitle(page);
    return title === undefined
      ? ""
      : ` (${escapeHtml(labels.diffTitleChanged)} ${escapeHtml(title)})`;
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

  const added = ordered.filter((page) => states.get(page.id) === "added");
  if (added.length > 0) section("added", labels.diffAddedPages, list(added.map(link)));
  const movedPages = ordered.flatMap((page) => moved.get(page.id) ?? []);
  if (movedPages.length > 0) {
    section(
      "moved",
      labels.diffMovedPages,
      list(
        movedPages.map(
          (page) =>
            `${link(page.new)} (<code>${escapeHtml(page.movedFrom!)}</code> → <code>${escapeHtml(page.new.route)}</code>)` +
            withTitle(page) +
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
      list(changedPages.map((page) => link(page.new) + withTitle(page) + counts(page))),
    );
  }
  if (deletedPages.length > 0) {
    section(
      "deleted",
      labels.diffDeletedPages,
      list(
        deletedPages.map(
          ({ entry, page }) =>
            link(page) +
            (entry.mergedInto === undefined
              ? ""
              : ` (${escapeHtml(labels.diffMergedInto)} ${link(entry.mergedInto)})`),
        ),
      ),
    );
  }
  const nothing = states.size === 0;
  const tail =
    `<p>${escapeHtml(labels.diffUnchangedPages)} ${unchanged}</p>` +
    (nothing ? `\n<p>${escapeHtml(labels.diffNoChanges)}</p>` : "");

  const title = changesTitle(labels.diffChanges, context.names);
  const changes: Page = {
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
  const listEntry: SidebarNode = { type: "page", title, route: CHANGES_ROUTE, pageId: id };
  // The earlier sidebar, its pages linking to what shows them now; numbers are the new version's
  // alone (19.1).
  const earlierSidebar = (nodes: readonly SidebarNode[]): SidebarNode[] =>
    nodes.flatMap((node): SidebarNode[] => {
      if (node.type === "dir") {
        const children = earlierSidebar(node.children);
        return children.length === 0
          ? []
          : [{ type: "dir", title: node.title, path: node.path, children }];
      }
      const target = matchedOld.get(node.pageId) ?? deletedByOld.get(node.pageId);
      return target === undefined
        ? []
        : [{ type: "page", title: node.title, route: target.route, pageId: target.id }];
    });
  // The earlier version as search reads it, in its own order, each page by what shows it now.
  const earlierSearch = inSidebarOrder(old.pages, old.sidebar).flatMap(
    (oldPage): EarlierSearchPage[] => {
      if (oldPage.hidden === true) return [];
      const shows = matchedOld.get(oldPage.id) ?? deletedByOld.get(oldPage.id);
      if (shows === undefined) return [];
      const formulas = (oldPage.formulas ?? []).map((formula) => ({ tex: formula.tex }));
      return [
        {
          route: shows.route,
          title: oldPage.title,
          hidden: false,
          headings: [],
          text: oldPage.text,
          ...(formulas.length > 0 ? { formulas } : {}),
        },
      ];
    },
  );
  return {
    pages: [changes, ...pages],
    sidebar: [listEntry, ...sidebar],
    sidebars: {
      current: copySidebar(next.sidebar),
      earlier: earlierSidebar(old.sidebar),
    },
    states,
    labels,
    changesPageId: id,
    earlierDiagrams,
    earlierSearch,
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

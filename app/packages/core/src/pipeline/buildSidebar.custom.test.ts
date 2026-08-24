import { describe, expect, it } from "vitest";
import { buildCustomSidebar, orderPagesBySidebar } from "./buildSidebar";
import type { Page, SidebarItem } from "../types";

function page(p: {
  id: string;
  route: string;
  relativePath: string;
  title: string;
  hidden?: boolean;
}): Page {
  return {
    id: p.id,
    route: p.route,
    sourcePath: "",
    relativePath: p.relativePath,
    format: "markdown",
    title: p.title,
    hidden: p.hidden,
    rawSource: "",
    html: "",
    text: "",
    headings: [],
    anchors: [],
    links: [],
    assets: [],
  };
}

const PAGES: Page[] = [
  page({ id: "index", route: "/", relativePath: "index.md", title: "Home" }),
  page({
    id: "setup-install",
    route: "/setup/install",
    relativePath: "setup/install.adoc",
    title: "Install",
  }),
  page({
    id: "setup-config",
    route: "/setup/config",
    relativePath: "setup/config.md",
    title: "Config",
  }),
  page({ id: "faq", route: "/faq", relativePath: "faq.md", title: "FAQ" }),
];

const ITEMS: SidebarItem[] = [
  { title: "Home", path: "index.md" },
  {
    title: "Setup",
    children: [{ path: "setup/install.adoc" }, { path: "setup/config.md" }],
  },
];

describe("buildCustomSidebar", () => {
  it("builds the tree in the configured order and nesting", () => {
    const { sidebar } = buildCustomSidebar(PAGES, ITEMS);

    expect(sidebar).toHaveLength(2);
    expect(sidebar[0]).toMatchObject({ type: "page", title: "Home", route: "/" });
    const group = sidebar[1];
    expect(group?.type).toBe("dir");
    if (group && group.type === "dir") {
      expect(group.title).toBe("Setup");
      // title 省略時はページ自身のタイトルを使う。
      expect(group.children).toEqual([
        { type: "page", title: "Install", route: "/setup/install", pageId: "setup-install" },
        { type: "page", title: "Config", route: "/setup/config", pageId: "setup-config" },
      ]);
    }
  });

  it("uses the configured title over the page title", () => {
    const { sidebar } = buildCustomSidebar(PAGES, [{ title: "Start here", path: "index.md" }]);
    expect(sidebar[0]).toMatchObject({ title: "Start here", route: "/" });
  });

  it("accepts ./ and backslash separated paths", () => {
    const { sidebar } = buildCustomSidebar(PAGES, [
      { path: "./index.md" },
      { path: "setup\\config.md" },
    ]);
    expect(sidebar.map((node) => (node.type === "page" ? node.route : node.title))).toEqual([
      "/",
      "/setup/config",
    ]);
  });

  it("throws when a listed path does not exist", () => {
    expect(() => buildCustomSidebar(PAGES, [{ path: "setup/missing.md" }])).toThrow(
      /Sidebar item not found: setup\/missing\.md/,
    );
  });

  it("warns about pages that the sidebar does not list", () => {
    const { warnings } = buildCustomSidebar(PAGES, ITEMS);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("faq.md");
  });

  it("skips a hidden page with a warning", () => {
    const pages = [
      ...PAGES,
      page({
        id: "draft",
        route: "/draft",
        relativePath: "draft.md",
        title: "Draft",
        hidden: true,
      }),
    ];
    const { sidebar, warnings } = buildCustomSidebar(pages, [
      { path: "index.md" },
      { path: "draft.md" },
    ]);

    expect(sidebar.map((node) => (node.type === "page" ? node.pageId : node.title))).toEqual([
      "index",
    ]);
    expect(
      warnings.some((w) => w.message.includes("hidden") && w.message.includes("draft.md")),
    ).toBe(true);
    // hidden ページは「未掲載」の警告には数えない（意図的に隠しているため）。
    expect(
      warnings.some((w) => w.message.includes("draft.md") && w.message.includes("Not listed")),
    ).toBe(false);
  });

  it("keeps only the first of a duplicated page and warns", () => {
    const { sidebar, warnings } = buildCustomSidebar(PAGES, [
      { path: "index.md" },
      { title: "Again", path: "index.md" },
    ]);

    expect(sidebar).toHaveLength(1);
    expect(warnings.some((w) => w.message.includes("more than once"))).toBe(true);
  });

  it("drops a group whose pages all disappear", () => {
    const pages = [
      ...PAGES,
      page({
        id: "draft",
        route: "/draft",
        relativePath: "draft.md",
        title: "Draft",
        hidden: true,
      }),
    ];
    const { sidebar, warnings } = buildCustomSidebar(pages, [
      { title: "Drafts", children: [{ path: "draft.md" }] },
    ]);

    expect(sidebar).toHaveLength(0);
    expect(warnings.some((w) => w.message.includes("Sidebar group has no visible pages"))).toBe(
      true,
    );
  });
});

describe("orderPagesBySidebar", () => {
  it("puts listed pages first in sidebar order and keeps the rest at the end", () => {
    const { orderedPages } = buildCustomSidebar(PAGES, [
      { path: "setup/config.md" },
      { path: "index.md" },
    ]);

    expect(orderPagesBySidebar(PAGES, orderedPages).map((p) => p.id)).toEqual([
      "setup-config",
      "index",
      "setup-install",
      "faq",
    ]);
  });
});

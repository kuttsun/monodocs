import { describe, expect, it } from "vitest";
import { buildSidebar } from "./buildSidebar";
import type { Page } from "../types";

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
    links: [],
    assets: [],
  };
}

describe("buildSidebar", () => {
  it("builds a nested tree from the folder structure", () => {
    const pages: Page[] = [
      page({ id: "index", route: "/", relativePath: "index.md", title: "Home" }),
      page({
        id: "setup-install",
        route: "/setup/install",
        relativePath: "setup/install.md",
        title: "Install",
      }),
      page({
        id: "setup-config",
        route: "/setup/config",
        relativePath: "setup/config.md",
        title: "Config",
      }),
    ];

    const tree = buildSidebar(pages);
    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({ type: "page", route: "/" });

    const dir = tree[1];
    expect(dir?.type).toBe("dir");
    if (dir && dir.type === "dir") {
      expect(dir.title).toBe("setup");
      const routes = dir.children.map((c) => (c.type === "page" ? c.route : c.path));
      expect(routes).toEqual(["/setup/install", "/setup/config"]);
    }
  });

  it("strips numeric order prefixes from directory titles when configured", () => {
    const pages: Page[] = [
      page({
        id: "01_setup-install",
        route: "/01_setup/install",
        relativePath: "01_setup/install.md",
        title: "Install",
      }),
    ];

    const tree = buildSidebar(pages, { titleTransform: { type: "stripNumberPrefix" } });
    const dir = tree[0];
    expect(dir?.type).toBe("dir");
    if (dir && dir.type === "dir") {
      // 表示タイトルは数字プレフィックスを除く。route/path は順序のため prefix を保持する。
      expect(dir.title).toBe("setup");
      expect(dir.path).toBe("01_setup");
    }
  });

  it("keeps directory titles verbatim by default", () => {
    const pages: Page[] = [
      page({
        id: "01_setup-install",
        route: "/01_setup/install",
        relativePath: "01_setup/install.md",
        title: "Install",
      }),
    ];

    const dir = buildSidebar(pages)[0];
    if (dir && dir.type === "dir") {
      expect(dir.title).toBe("01_setup");
    }
  });

  it("applies regex titleTransform to directory titles", () => {
    const pages: Page[] = [
      page({
        id: "req-001_setup-install",
        route: "/REQ-001_setup/install",
        relativePath: "REQ-001_setup/install.md",
        title: "Install",
      }),
    ];

    const dir = buildSidebar(pages, {
      titleTransform: { type: "regex", pattern: "^REQ-\\d+_", replacement: "" },
    })[0];
    if (dir && dir.type === "dir") {
      expect(dir.title).toBe("setup");
    }
  });

  it("excludes hidden pages", () => {
    const pages: Page[] = [
      page({ id: "index", route: "/", relativePath: "index.md", title: "Home" }),
      page({
        id: "secret",
        route: "/secret",
        relativePath: "secret.md",
        title: "Secret",
        hidden: true,
      }),
    ];
    expect(buildSidebar(pages)).toHaveLength(1);
  });

  it("keeps single-page directories by default", () => {
    const pages: Page[] = [
      page({
        id: "report-summary",
        route: "/report/summary",
        relativePath: "report/summary.md",
        title: "Summary",
      }),
    ];
    const tree = buildSidebar(pages);
    expect(tree[0]?.type).toBe("dir");
  });

  describe("flattenSingleChild", () => {
    it("hoists the sole page of a single-page directory to its parent", () => {
      const pages: Page[] = [
        page({ id: "index", route: "/", relativePath: "index.md", title: "Home" }),
        // report/ にはページが 1 つ（画像などは数えない）→ フォルダ階層は冗長。
        page({
          id: "report-summary",
          route: "/report/summary",
          relativePath: "report/summary.md",
          title: "Summary",
        }),
      ];
      const tree = buildSidebar(pages, { flattenSingleChild: true });
      // report ディレクトリは消え、ページが親（ルート）へ繰り上がる。route は不変。
      expect(tree).toEqual([
        { type: "page", title: "Home", route: "/", pageId: "index" },
        { type: "page", title: "Summary", route: "/report/summary", pageId: "report-summary" },
      ]);
    });

    it("keeps directories that hold more than one page", () => {
      const pages: Page[] = [
        page({
          id: "setup-install",
          route: "/setup/install",
          relativePath: "setup/install.md",
          title: "Install",
        }),
        page({
          id: "setup-config",
          route: "/setup/config",
          relativePath: "setup/config.md",
          title: "Config",
        }),
      ];
      const tree = buildSidebar(pages, { flattenSingleChild: true });
      expect(tree[0]?.type).toBe("dir");
    });

    it("collapses a nested single-page chain down to the page", () => {
      const pages: Page[] = [
        page({
          id: "a-b-only",
          route: "/a/b/only",
          relativePath: "a/b/only.md",
          title: "Only",
        }),
      ];
      const tree = buildSidebar(pages, { flattenSingleChild: true });
      expect(tree).toEqual([
        { type: "page", title: "Only", route: "/a/b/only", pageId: "a-b-only" },
      ]);
    });

    it("does not flatten a directory whose single child is a multi-page subdirectory", () => {
      const pages: Page[] = [
        page({
          id: "guide-setup-install",
          route: "/guide/setup/install",
          relativePath: "guide/setup/install.md",
          title: "Install",
        }),
        page({
          id: "guide-setup-config",
          route: "/guide/setup/config",
          relativePath: "guide/setup/config.md",
          title: "Config",
        }),
      ];
      const tree = buildSidebar(pages, { flattenSingleChild: true });
      // guide は唯一の子が複数ページを持つ setup（構造あり）なので畳まない。
      const guide = tree[0];
      expect(guide?.type).toBe("dir");
      if (guide?.type === "dir") {
        expect(guide.title).toBe("guide");
        expect(guide.children[0]?.type).toBe("dir");
      }
    });

    it("keeps a single-page directory that also has a subdirectory", () => {
      const pages: Page[] = [
        page({
          id: "section-intro",
          route: "/section/intro",
          relativePath: "section/intro.md",
          title: "Intro",
        }),
        page({
          id: "section-deep-detail",
          route: "/section/deep/detail",
          relativePath: "section/deep/detail.md",
          title: "Detail",
        }),
      ];
      const tree = buildSidebar(pages, { flattenSingleChild: true });
      // section はページ 1 つ + サブフォルダ deep を持つので畳まない（サブフォルダ側は単独ページ
      // なので deep は detail へ畳まれる）。
      const section = tree[0];
      expect(section?.type).toBe("dir");
      if (section?.type === "dir") {
        expect(section.children).toEqual([
          { type: "page", title: "Intro", route: "/section/intro", pageId: "section-intro" },
          {
            type: "page",
            title: "Detail",
            route: "/section/deep/detail",
            pageId: "section-deep-detail",
          },
        ]);
      }
    });
  });
});

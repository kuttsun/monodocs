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

  it("strips numeric order prefixes from directory titles when enabled", () => {
    const pages: Page[] = [
      page({
        id: "01_setup-install",
        route: "/01_setup/install",
        relativePath: "01_setup/install.md",
        title: "Install",
      }),
    ];

    const tree = buildSidebar(pages, { stripNumberPrefix: true });
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
});

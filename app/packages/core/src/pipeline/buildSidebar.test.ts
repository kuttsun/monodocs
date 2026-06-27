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

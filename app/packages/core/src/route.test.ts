import { describe, expect, it } from "vitest";
import { toPageId, toRoute } from "./route";

describe("toRoute", () => {
  it("maps top-level index to /", () => {
    expect(toRoute("index.md")).toBe("/");
  });

  it("maps a nested file", () => {
    expect(toRoute("setup/install.md")).toBe("/setup/install");
  });

  it("maps a directory index to the directory route", () => {
    expect(toRoute("setup/index.md")).toBe("/setup");
  });

  it("strips the .markdown extension", () => {
    expect(toRoute("a/b.markdown")).toBe("/a/b");
  });
});

describe("toPageId", () => {
  it("maps / to index", () => {
    expect(toPageId("/")).toBe("index");
  });

  it("joins segments with hyphens", () => {
    expect(toPageId("/setup/install")).toBe("setup-install");
  });

  it("keeps unicode segments", () => {
    expect(toPageId("/インストール")).toBe("インストール");
  });
});

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { mermaidRuntimeScript } from "./mermaid";

describe("the CDN Mermaid runtime", () => {
  // `inline` and `pre-render` embed the installed runtime, so `cdn` drawing alike rests on the pinned
  // URL moving with every upgrade; v0.15 found it left on 11 (roadmap 21.3).
  it("loads the version installed, which inline and pre-render embed", async () => {
    const { version } = JSON.parse(
      readFileSync(createRequire(import.meta.url).resolve("mermaid/package.json"), "utf8"),
    ) as { version: string };
    const script = await mermaidRuntimeScript("cdn");
    const pinned = [...script.matchAll(/\/npm\/mermaid@([^/"]+)\//g)].map((m) => m[1]);
    expect(pinned).toEqual([version]);
  });
});

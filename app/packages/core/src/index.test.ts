import { describe, expect, it } from "vitest";
import { buildSite, toRoute, markdownRenderer } from "./index";
import type { ContentWidthDefault, MermaidMode, PdfDensity, PdfPageBreakLevel } from "./index";

describe("@monodocs/core public API", () => {
  it("exports buildSite as a function", () => {
    expect(typeof buildSite).toBe("function");
  });

  it("exports helpers and the markdown renderer", () => {
    expect(typeof toRoute).toBe("function");
    expect(markdownRenderer.format).toBe("markdown");
  });

  it("exports the configuration types a caller has to name", () => {
    // `package.json` publishes only `"."`, so a type that is not re-exported here cannot be named
    // by a caller at all — a deep import into `config.js` is outside the package exports. These
    // two annotations are the test: they fail to compile if the re-export is dropped.
    const level: PdfPageBreakLevel = 3;
    // The same gap, found by looking for others of its kind: both appear in exported option types
    // — `PostprocessOptions.mermaidMode`, `RenderHtmlInput.contentWidthDefault` — and neither could
    // be named from outside the package.
    const mermaid: MermaidMode = "pre-render";
    const width: ContentWidthDefault = "wide";
    const density: PdfDensity = {
      fontSize: "16px",
      lineHeight: "1.45",
      headingSpacing: "0.9em",
      tableCellPadding: "0.35rem 0.6rem",
    };
    expect(level).toBe(3);
    expect(mermaid).toBe("pre-render");
    expect(width).toBe("wide");
    expect(density.fontSize).toBe("16px");
  });
});

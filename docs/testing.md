# Testing

[日本語](ja/testing.md)

## Policy

- The test runner uses [vitest](https://vitest.dev/).
- Types:
  - **Unit tests**: route generation / format detection / each SourceRenderer / sidebar generation, etc.
  - **e2e tests**: generate Markdown / AsciiDoc in a temporary directory, output a
    single HTML with `buildSite()`, and verify the content
  - **Client tests**: run the theme's `app.js` on happy-dom and verify page switching via hash routing
    (encode/decode consistency)
- All verification runs inside Docker / devcontainer and does not pollute the host environment.

## How to Run

Run from the host using the dedicated image (see [development.md](development.md)).

```bash
scripts/app.sh pnpm test         # run all at once (vitest run)
scripts/app.sh pnpm test:watch   # watch
scripts/app.sh pnpm ci:check     # format, build, typecheck, tests, and CLI bundle
scripts/app.sh pnpm package:verify # build, install, and smoke-test the npm package artifact
```

When using `docker run` directly:

```bash
docker run --rm -v "$PWD":/work -w /work/app monodocs-dev pnpm test
```

Inside a devcontainer, or when you are in the container's shell, you can run `pnpm test` directly in `app/`.

## Test Results (as of 2026-07-23)

| Item           | Result     |
| -------------- | ---------- |
| Test Files     | 22 passed  |
| Tests          | 216 passed |
| typecheck      | passed     |
| format:check   | passed     |
| package:verify | passed     |

Main test targets:

- `route.test.ts` … route / page id generation
- `sources/detectFormat.test.ts` … format detection from file extensions
- `sources/meta.test.ts` … normalization of frontmatter / `:sd-*:` metadata
- `sources/markdown/renderer.test.ts` … Markdown conversion, H1 / frontmatter extraction, ID prefix for headings/footnotes, GFM
- `sources/asciidoc/renderer.test.ts` … AsciiDoc conversion, title / `:sd-*:` extraction, xref rewriting
- `sources/prefixIds.ts` … prefix for all element IDs, anchor rewriting (common to Markdown/AsciiDoc; indirectly verified in each renderer test)
- `scan.test.ts` … scanning via extension map, custom extensions, exclusion
- `pipeline/buildPages.test.ts` … duplicate detection of route / page id
- `pipeline/buildSidebar.test.ts` … folder-structure sidebar
- `pipeline/postprocess.test.ts` … link conversion, image data URI embedding, Mermaid conversion (client / pre-render SVG conversion, globally unique ids, verbatim preservation of complex SVG, per-diagram error source fallback, fail fast on environment errors `BrowserSetupError` (including `MermaidPrerenderSetupError`), renderer-not-injected error), shiki code highlighting, common structuring of admonition / GFM alert
- `pipeline/renderSingleHtml.test.ts` … href encoding, HTML escaping, optional content-width control and initial state, optional image lightbox markup, client page data (table of contents/search)
- `themes/default/app.test.ts` … client hash routing (happy-dom)
- `themes/default/app.v04.test.ts` … search, in-page table of contents, prev/next navigation, dark mode, persistent content-width toggle and configured initial state, sidebar collapse, code block copy/wrap toggle, image lightbox mouse/keyboard/focus behavior and linked/decorative-image exclusion (happy-dom)
- `build.test.ts` / `build.mixed.test.ts` / `build.v03.test.ts` … e2e (Markdown / mixed / v0.3 features, validate)
- `build.mermaid-prerender.test.ts` … Mermaid pre-render (verifies config integration and SVG embedding via fake renderer injection; end-to-end rendering and runtime-not-injected gating are confirmed only in environments with a real Chromium)
- `build.v04.test.ts` … e2e (`watchSite` rebuild, `serveSite` delivery and live-reload injection, `serveSite` serving HTML even with pdf/both configuration and respecting an explicit `-o`)
- `build.pdf.test.ts` … PDF output (v0.5. browserless verification of `resolveOutputs` html/pdf/both output path resolution, format branching and configuration (pageSize/margin/printBackground) integration via fake `PdfGenerator` injection, embedImages override, bookmark outline passing. Actual PDF generation = `%PDF-`, `/Outlines`, and `/UseOutlines` confirmed only in environments with a real Chromium)
- `pipeline/pdfOutline.test.ts` … PDF bookmarks (`sidebarToOutline` tree conversion, `collectDests`/`remapDests`, `addOutline` referencing `/Dests` to build folder→page `/Outlines` and set `/UseOutlines`. Destinations absent / empty tree returns the original PDF. pdf-lib only, browserless)
- `config.test.ts` … configuration resolution (including content-width and image-lightbox defaults/toggles, `pdf` schema defaults, completion of missing margins, rejection of unknown keys, rejection of invalid `--format`, and default output paths per format)

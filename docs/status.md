# Implementation Status

[日本語](ja/status.md)

Last updated: 2026-07-24

## Support Status

| Feature                                           | State          | Target Version |
| ------------------------------------------------- | -------------- | -------------- |
| Development environment (devcontainer / monorepo) | ✅ Done        | -              |
| Markdown → single HTML (MVP)                      | ✅ Done        | v0.1           |
| AsciiDoc support / mixed-format support           | ✅ Done        | v0.2           |
| Link conversion / image embedding / Mermaid       | ✅ Done        | v0.3           |
| Search / table of contents / watch / serve        | ✅ Done        | v0.4           |
| PDF output                                        | ✅ Done        | v0.5           |
| npm / GitHub Actions                              | ✅ Done        | v0.6           |
| VS Code extension                                 | 🚧 Planned     | v0.7           |

## Completion Criteria Status

### v0.1: Markdown Single-HTML MVP

- [x] `monodocs build ./docs -o ./dist/manual.html` works
- [x] Multiple Markdown files are included in a single HTML
- [x] Pages can be switched from the sidebar (hash route)
- [x] H1 is used as the title (falls back to the file name with a warning if absent)

### v0.2: AsciiDoc Basic Support / Mixed-Format Support

- [x] Builds even when `.md` and `.adoc` are mixed
- [x] AsciiDoc's `= Title` becomes the page title
- [x] Markdown / AsciiDoc are shown in the same sidebar
- [x] Include files (`_*` / `partials/**` / `includes/**`) can be excluded from being turned into pages
- [x] AsciiDoc xrefs within the same document are converted to links within the single HTML

### v0.3: Practical Features

- [x] Links between Markdown / AsciiDoc can be converted to hash routes (`.md` / `.adoc` / `.html`)
- [x] Images can be embedded into the HTML as data URIs (size limit and over-limit behavior are configurable)
- [x] Mermaid in Markdown / AsciiDoc can be displayed (`mermaid.mode`: `client` (the default) switches the runtime between CDN / inline. `pre-render` renders each diagram as SVG at build time using headless Chromium and embeds it—no JS required, print-stable, and smaller than inline when there are few diagrams. Not available in the bundled CLI (single `.cjs` / single executable); the npm-installed version is required)
- [x] order / hidden / description can be controlled via frontmatter / `:sd-*:`
- [x] validate can detect broken links, missing images, and missing titles

### v0.4: HTML Documentation Site Enhancements

- [x] In-HTML search works (partial match on titles, headings, and body text; search box in the sidebar)
- [x] An in-page table of contents (h2 / h3 by default) is shown (highlights the current position as you scroll; the deepest level can be set to 2–6 via `toc.maxLevel`)
- [x] Previous/next page navigation is shown (hidden pages are excluded)
- [x] The sidebar can be collapsed (an overall toggle plus per-directory open/close; `sidebar.collapseDepth` collapses directories deeper than this level by default)
- [x] Sidebar folder names are displayed as-is without forced uppercasing. `sidebar.titleTransform.page` / `directory` can apply separate transforms to page display titles and folder display names (routes are preserved for ordering)
- [x] With `sidebar.titleFrom: "filename"`, the file name can be used as the page title even when a heading (H1 / `= Title`) exists (an explicit title frontmatter `title` / `:sd-title:` always takes top priority). The default is `"heading"` (frontmatter → heading → file name)
- [x] `sidebar.flattenSingleChild` collapses folder hierarchies that contain only a single page (with no subfolders) and promotes that sole page to the parent (eliminating redundant hierarchy when a document and images are grouped into one folder; routes are unchanged so reachability is preserved)
- [x] Dark mode is supported (follows the OS setting; manual toggling is saved to localStorage)
- [x] The main content can be toggled between the readable default width and the full available width (the reader's choice is saved to localStorage, `html.contentWidthDefault` selects the initial state, and `html.contentWidthToggle: false` hides the control)
- [x] Unlinked, non-decorative content images open in a keyboard-accessible lightbox (`html.imageLightbox`, default true; linked and explicitly decorative images preserve their semantics; omitted from print/PDF)
- [x] A print layout that expands all pages vertically when printing (`@media print`)
- [x] Code blocks are syntax-highlighted with shiki (dual theme follows dark mode; a background that stays distinguishable from body text even in light mode)
- [x] Copy / word-wrap toggle buttons are shown on code blocks (shown on hover; injected client-side)
- [x] `monodocs watch` can watch for input/config changes and rebuild
- [x] `monodocs serve` provides a local preview (live reload on change detection; auto-launch with `--open`)

### v0.5: PDF Output

- [x] `monodocs build --format pdf -o ./dist/manual.pdf` can generate a PDF via a single HTML (headless Chromium; all pages expanded vertically in the print layout)
- [x] `--format both` can output HTML and PDF simultaneously (`-o` is treated as a directory, outputting `manual.html` / `manual.pdf`)
- [x] When client-mode Mermaid is included, all pages are expanded and rendering of each diagram is awaited before generating the PDF (pre-rendered SVGs are embedded as-is)
- [x] `pdf.pageSize` / `pdf.margin` / `pdf.printBackground` can be controlled via configuration (defaults: A4, 20/15/20/15mm, background printing on)
- [x] Images are embedded as data URIs on PDF output (because a distributed PDF cannot reference external relative images, they are embedded even when `assets.embedImages: false`—overriding it—with a warning. Large images externalized via `onLargeImage: external` are not included in the PDF)
- [x] Alert/admonition icons are embedded as inline SVG (because a CSS mask becomes a soft mask in PDFs and renders as a filled square in some viewers). Avoid mid-element page breaks of `.admonition` / figures / code blocks etc. in print (`break-inside: avoid`)
- [x] Bookmarks (outline) are added to the PDF with the same folder→page structure as the HTML sidebar (`pdf.bookmarks`, default true). Internal links to ASCII surrogate destinations are injected at each page position so Chromium creates `/Dests`, and `/Outlines` is built with `pdf-lib` (robust even with Unicode page ids; the bookmarks panel is shown by default in viewers)
- [x] Inter-page links in the PDF body are made clickable (since SPA hash routes `#/route` have no corresponding element in a PDF and cannot be navigated to, `renderPdf` rewrites `#/route` to `#page-{id}` using each article's `data-route` → element id mapping, and Chromium generates internal links = GoTo annotations). In-page anchors (footnotes, headings) remain valid as-is
- [x] Puppeteer startup handling is unified in `pipeline/browser.ts` and shared between Mermaid pre-render and PDF (environment errors fail fast with `BrowserSetupError`)
- [x] Since `serve` is for preview purposes, it serves HTML even when the configuration is pdf/both (it does not regenerate the PDF each time; an explicit `-o` is respected)
- [x] PDF output is not available in the bundled CLI (single `.cjs` / single executable) (`puppeteer-core` is made `external`; the npm-installed version is required)

### v0.6: Distribution / CI Support

- [x] Generated HTML and PDF show a linked monodocs name and CLI version at the document end by default (`html.branding: false` hides the footer)
- [x] The publishing policy, supported environments, npm package boundary, and 0.x support policy are defined
- [x] Contribution and security policies plus bug, feature, and pull request templates are present
- [x] Pull request CI runs formatting, build, typecheck, tests, bundle generation, dependency audit, and license notice verification on Linux x64 and Windows x64
- [x] Pull request CI smoke-tests HTML, validate, PDF, and Mermaid pre-render, including the PDF header, on Linux x64 and Windows x64
- [x] A publish staging directory and allowlisted npm tarball can be generated without `workspace:*` dependencies
- [x] The staged `0.6.0-beta.1` tarball has been installed locally and smoke-tested for HTML, PDF, validate, Mermaid pre-render, and serve
- [x] Install and smoke-test the actual npm tarball in CI on Linux x64 and Windows x64
- [x] Prepare a GitHub Release-triggered npm publishing workflow with version/tag validation, release approval, OIDC, and provenance
- [x] Complete repository security and branch-protection settings
- [x] Configure npm Trusted Publishing, release approval, provenance, and maintainer 2FA
- [x] Publish `0.6.0-beta.1`, then `0.6.0-beta.2` (adding Windows browser auto-detection), to npm under the `next` tag (the first published version also holds `latest` until the stable release)
- [x] Verify the published beta on Linux x64 and Windows x64 (install, HTML / PDF / both / Mermaid pre-render, and browser auto-detection with no `PUPPETEER_EXECUTABLE_PATH`; plus manual serve / watch / uninstall / README checks)
- [x] Publish and verify the stable `0.6.0` release

## Supported Syntax

The supported syntax for Markdown / AsciiDoc, along with the unsupported items and limitations that come with single-HTML generation, is documented as a specification in [syntax.md](syntax.md) (including footnote ID collision avoidance and in-page anchor handling). Markdown GFM alerts (such as `> [!NOTE]`) and AsciiDoc admonitions are normalized into a common `.admonition` structure for display.

## Known Unsupported Items / Limitations (to be addressed in future versions)

- Code highlighting (shiki) is supported (can be disabled with `highlight.enabled: false`; dual theme follows dark mode)
- Heading-level cross-file links (`file.md#heading` / `xref:other.adoc#sec`) are resolved only down to the file level (heading anchors in other files are unsupported; anchors and footnotes within the same page work)
- Search is partial-match only (scoring, multiple keywords, and Japanese word segmentation are planned to be improved in v0.8)
- `watch` / `serve` monitoring uses `fs.watch` (recursive when possible). If `input` is changed in the configuration, a restart is required
- PDF output is supported (v0.5; `--format pdf` / `both`). Because it uses headless Chromium, Chromium must be present in the runtime environment, and it is not available in the bundled CLI (single `.cjs` / single executable) (the npm-installed version is required). When Mermaid is set to the `cdn` runtime, a network connection is required during PDF generation (use `inline` or `pre-render` to be reliably offline)
- **PDF fonts use the system fonts of the runtime environment.** If a font for a character type appearing in the body is missing, it becomes tofu (□ / ☒) in the PDF (e.g., the emoji ✅ requires an emoji font). The development Docker image already bundles `fonts-noto-cjk` (Japanese) plus `fonts-noto-color-emoji` (emoji). When producing PDFs in your own environment, install fonts according to the character types you use (HTML is unaffected because it uses the browser's fonts)
- Input is assumed to be trusted documents (AsciiDoc raw HTML is not sanitized; see [development.md](development.md) for details)

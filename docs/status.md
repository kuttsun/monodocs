# Implementation Status

[日本語](ja/status.md)

Last updated: 2026-08-06

## Support Status

| Feature                                           | State     | Target Version |
| ------------------------------------------------- | --------- | -------------- |
| Development environment (devcontainer / monorepo) | ✅ Done   | -              |
| Markdown → single HTML (MVP)                      | ✅ Done   | v0.1           |
| AsciiDoc support / mixed-format support           | ✅ Done   | v0.2           |
| Link conversion / image embedding / Mermaid       | ✅ Done   | v0.3           |
| Search / table of contents / watch / serve        | ✅ Done   | v0.4           |
| PDF output                                        | ✅ Done   | v0.5           |
| npm / GitHub Actions                              | ✅ Done   | v0.6           |
| VS Code extension                                 | ⏸️ Frozen | v0.7           |
| Advanced features (search, themes, binary)        | ✅ Done   | v0.8           |
| Search finishing (kana folding, keyboard)         | ✅ Done   | v0.9           |
| Language, `init`, PDF fonts and page numbers      | 🚧 Planned| v0.10          |

The VS Code extension is frozen and not scheduled: demand is unknown, the release and Marketplace pipeline is
disproportionate for a single maintainer, and the boundary between the extension and `@monodocs/core` is still
undecided. The reasoning is recorded under v0.7 in [roadmap.md](roadmap.md). v0.8 was worked on in its place,
and both it and v0.9 are released.

## Completion Criteria Status

### v0.1: Markdown Single-HTML MVP

- [x] `monodocs build ./docs -o ./dist/docs.html` works
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

- [x] `monodocs build --format pdf -o ./dist/docs.pdf` can generate a PDF via a single HTML (headless Chromium; all pages expanded vertically in the print layout)
- [x] `--format both` can output HTML and PDF simultaneously (`-o` is treated as a directory, outputting `docs.html` / `docs.pdf`)
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
- [x] Document GitHub Actions and GitLab CI workflows for `validate`, HTML, and PDF on the documentation site
      (a dedicated reusable GitHub Action is not published; see [roadmap.md](roadmap.md))

### v0.8: Advanced Features

- [x] Heading-level cross-file links (`file.md#heading` / `xref:other.adoc#sec`) resolve to the target page's element ID
- [x] Search accepts multiple keywords (split on whitespace including the ideographic space) and requires every keyword to match
- [x] Search results are ranked by field weight (title > heading > body) with capped repeat and phrase bonuses; ties keep document order
- [x] A result that matched a heading links to that heading instead of the page top and shows it under the page title (headings deeper than `toc.maxLevel` are searchable although the in-page table of contents hides them)
- [x] Keywords are highlighted in the title, heading, and snippet, and the snippet is the body window containing the most distinct keywords
- [x] Matching folds case and full-width alphanumerics, so `ＰＤＦ` and `pdf` find the same pages
- [x] `html.theme` accepts a custom theme directory (resolved relative to the config file); `template.html` / `style.css` / `app.js` are individually optional and fall back to the default theme, a template missing a required token fails the build, and `watch` / `serve` watch the theme directory, following a theme switch made in the configuration
- [x] Custom sidebars (`sidebar.mode: custom`) define the sidebar structure, order, and titles, and the same order drives prev/next navigation, PDF page order, and the initially shown page
- [x] A custom sidebar reports a missing path as an error, and unlisted, hidden, or duplicated pages as warnings that `validate` surfaces
- [x] A standalone binary that runs without Node.js is attached to every GitHub Release for Linux x64 and Windows x64, with a `.sha256` file and a `-NOTICES.txt` carrying the licenses of the embedded dependencies and Node.js runtime (macOS is not published; see [roadmap.md](roadmap.md) 8.5)
- [x] Pull request CI builds the standalone binary on Linux x64 and Windows x64 and smoke-tests it, including the expected failure of PDF output
- [x] Homebrew / Scoop / winget support is decided: not provided, because npm and the release binary already cover the audience without a per-release manifest and review process ([roadmap.md](roadmap.md) 8.5)
- [x] Wide content no longer disappears from the PDF: code blocks wrap, long unbreakable strings such as URLs break, tables are laid out as tables (not a scroll box) with the header row repeated on every page, and diagrams are capped at the page width
- [x] On narrow screens the sidebar is an overlay drawer that starts closed, so the document opens on its content, and the page no longer scrolls horizontally
- [x] Generated PDFs record the document title and `monodocs v<version>` as the creating and producing tool
- [x] The binary's PDF / pre-render failure tells the reader to use the npm package instead of naming a package-manager command that its audience — people without Node.js — cannot run
- [x] Publish `0.8.0-beta.1` to npm under the `next` tag (0.7.0 is skipped: the version number stays reserved for the frozen VS Code extension milestone)
- [x] Verify the published beta npm package on Linux x64 and Windows x64 through `verify-published.yml` (install, HTML, PDF, browser auto-detection with no `PUPPETEER_EXECUTABLE_PATH`, `--format both`, Mermaid pre-render)
- [x] Verify the Linux x64 release binary against its `.sha256` and run it on a host without Node.js (validate, self-contained HTML, custom sidebar, style-only custom theme, and the expected PDF failure)
- [x] Verify the Windows x64 release binary, plus `serve` / `watch`, by hand (`verify-published.yml` deliberately leaves long-running commands out of scope). SmartScreen did not appear, but the download used `curl.exe`, which attaches no Mark of the Web, so this does not test the warning the documentation hedges about — a browser download from the Releases page still can trigger it. That browser download is deliberately left unverified: the binaries are unsigned by decision ([roadmap.md](roadmap.md) 8.5), so the prompt is expected rather than a defect, and the site documentation already warns readers about it. The hedge stays a hedge; revisit only if code signing becomes possible
- [x] Publish and verify the stable `0.8.0` release, and pin the CI guide on the documentation site to it (npm `latest` is `0.8.0` with provenance, re-verified on Linux x64 and Windows x64 through `verify-published.yml`; both binaries, their `.sha256`, and their `-NOTICES.txt` are attached to the release, and the released Linux binary carries the corrected failure message)

### v0.9: Search Finishing

- [x] Search folds katakana to hiragana (U+30A1–U+30F6 ↔ U+3041–U+3096, so voiced forms and `ヴ` / `ヵ` / `ヶ` are covered), so `インストール` and `いんすとーる` find each other
- [x] The prolonged sound mark `ー`, the dash family (U+2010–U+2015, U+2212), and the full-width hyphen fold to `-`, and the wave dash `〜` and full-width tilde `～` fold to `~`, so a spelling difference in those characters no longer splits results
- [x] Folding stays one character to one character, so highlighting still marks the original spelling (a hiragana query marks `インストール` in the result list)
- [x] Half-width katakana, okurigana variants, and English stemming are recorded as out of scope with their reason: each changes token length and would require replacing the fold-in-place model with a token-to-source position map ([roadmap.md](roadmap.md) 22.3)
- [x] The result list is navigated with `↓` / `↑` (wrapping at both ends) and opened with `Enter`, which opens the top result when nothing is selected yet; `Escape` still clears the query
- [x] Focus stays in the search box while selecting, so the query can be narrowed without tabbing back. The selection is published through `aria-activedescendant` on an ARIA combobox / listbox pair, and the selected row carries its own outline because the focus ring stays on the input
- [x] Mouse and keyboard cannot disagree: pointing at a row moves the selection to it, and both ways of opening a result run the same code path. The roles are attached from `app.js`, so a custom theme that replaces `template.html` still gets them
- [x] The keys are left to the IME while it is composing, so the arrows still move through conversion candidates and `Enter` still commits one instead of opening a result for a half-composed query
- [x] Option IDs are allocated against the IDs the document already contains, so a heading that would produce the same string does not shadow the result row and break anchor navigation
- [x] Opening a result marks its keywords in the body of the page it opens, with the same folding as the result list, and keeps marking them while the search stays open, so prev/next or a link inside the body does not lose the matches. Where the result opens is unchanged
- [x] Editing or clearing the query removes the marks and puts the body back as it was, in the same structure and node count. Only the marks the script created are removed — identified by a DOM property, not by their class — so a document's own `<mark>` (AsciiDoc `#text#`) and any content that happens to use the same class survive. Mermaid source, rendered diagrams, and the code-block toolbar are left untouched, and both the number of marks per page and the match collection behind it are capped ([roadmap.md](roadmap.md) 22.5)
- [x] The default output is `./dist/docs.html` (`--format pdf`: `./dist/docs.pdf`; `--format both`: `docs.html` / `docs.pdf` inside the directory given to `-o`). Renamed from `manual.html` / `manual.pdf` because monodocs bundles whatever set of pages it is given, which is not necessarily a manual — a breaking change for anyone who relied on the default, taken before 1.0
- [x] The published sample demonstrates the search work: a Search page in `examples/` collects queries a reader can type against the sample itself, and states which spelling differences are deliberately not folded
- [x] Publish `0.9.0-beta.1` to npm under the `next` tag
- [x] Verify the published beta npm package on Linux x64 and Windows x64 through `verify-published.yml` (install, HTML, PDF, browser auto-detection with no `PUPPETEER_EXECUTABLE_PATH`, `--format both`, Mermaid pre-render), confirming the renamed default output lands as `docs.html` / `docs.pdf`
- [x] Verify the Linux x64 release binary against its `.sha256` and run it: `validate`, a build with `-o` omitted writing `dist/docs.html`, no external asset references in the output, and the expected PDF failure pointing at the npm package
- [x] Verify the Windows x64 release binary by hand, plus `serve` / `watch` (`verify-published.yml` deliberately leaves long-running commands and the release binaries out of its scope). The mechanical part is now automated in [`scripts/verify-windows-binary.ps1`](../scripts/verify-windows-binary.ps1), run against the published asset on real Windows x64 hardware: `.sha256` match, `validate`, a build without `-o` writing `dist/docs.html`, no external asset reference in the output, a build from a path containing spaces and Japanese characters, PDF and Mermaid pre-render failing with the guidance to switch to the npm build, the NOTICES file, `serve` (live reload broadcast over SSE, the edit reaching the served page, and the port released on stop), and `watch` (initial build and rebuild after an edit) — 16 of 16 checks passed. Browser rendering and `serve --open` were checked by hand, since a script cannot settle them. As in v0.8 no Mark of the Web was attached, because the script downloads with `curl.exe` / `Invoke-WebRequest`, so the warning the documentation hedges about is still untested. The hedge stays a hedge; revisit only if code signing becomes possible
- [x] Publish and verify the stable `0.9.0` release, and pin the CI guide on the documentation site to it

### v0.10: Language and Pre-1.0 Gaps

[roadmap.md](roadmap.md) defines this milestone; the list below tracks it.

**CLI and runtime messages**

- [ ] `--help` — including the `Usage:` / `Options:` / `Commands:` headings Commander generates, reached through `configureHelp` / `addHelpText` — and every error and warning read in English by default, and in Japanese under `--lang ja` or `MONODOCS_LANG=ja`. The flag wins over the environment variable; an unsupported value is rejected naming the supported ones rather than falling back silently. `LANG` / `LC_ALL` are deliberately not consulted, so a build log does not depend on the machine that produced it ([roadmap.md](roadmap.md) 25.6)
- [ ] The catalogue covers every string monodocs itself emits and a test fails when a new one is added outside it. A message that reaches the user unwrapped from a dependency (a Zod parse error, a Puppeteer stack) is out of scope; where monodocs already wraps one, the wrapper is translated. The boundary is written down

**Document language and UI labels** ([roadmap.md](roadmap.md) 23.4)

- [ ] The top-level `lang` key sets both `<html lang>` and the UI labels, defaulting to `en`, so the output no longer declares one language while displaying another. This reverses the English-only label decision recorded in [architecture.md](architecture.md) and [development.md](development.md), both updated rather than left contradicting the roadmap. Anyone who relied on the previously hardcoded `<html lang="ja">` sees it change — a breaking change taken before 1.0
- [ ] `lang` accepts any syntactically valid BCP 47 tag and rejects anything else instead of writing it into the attribute. Matching is case-insensitive on the primary language subtag (`en-GB`, `JA` → `en`, `ja`); a tag with no shipped table — including a wholly private-use `x-…` or a grandfathered tag, which have no subtag to match — falls back to the English labels and warns once per build, naming the tag
- [ ] Core resolves the table and applies `html.labels` over it, publishing the result in `{{siteDataJson}}`; `app.js` consumes that rather than holding its own copy, so a table and an override cannot drift apart
- [ ] `en` and `ja` tables are complete over the enumerated key set — a key missing from either is a build failure, not a silent fallback — and the key set is listed in the configuration reference because 1.0 freezes it. An unknown `html.labels` key is rejected rather than ignored
- [ ] Label values are escaped per destination: HTML text, attributes such as `title` / `aria-label`, and the JSON of `siteDataJson` each need different treatment, and a value containing `<` or a quote reaches all three intact
- [ ] The theme guarantee is implemented and documented as four distinct degrees, not one: every theme gets the labels as data in `{{siteDataJson}}`; the default `app.js` applies them to the default template's DOM hooks; a theme replacing `app.js` applies them itself; static text a custom `template.html` spells out stays as written. `{{lang}}` is an optional token, so a template hardcoding `<html lang>` keeps what it wrote

**`monodocs init`** ([roadmap.md](roadmap.md) 25.1)

- [ ] Writes `monodocs.config.yml` and `docs/index.md` that build without editing; when either already exists it writes neither and names what it found. The generated configuration is a short commented starting point rather than a dump of every key, and its comments follow the message language

**Font checking** ([roadmap.md](roadmap.md) 24.3.3)

- [ ] A build on a machine missing a font the document needs warns, naming the clusters at risk and an example font that covers them from a built-in script-to-example table — not a package name, which differs across platforms. A document needing nothing the machine lacks stays silent
- [ ] The unit is the grapheme cluster paired with the computed font of the element it appears in, not a codepoint and not one representative character per script, so a variation sequence or emoji ZWJ sequence whose individual codepoints all draw is still caught. The check runs after `document.fonts.ready`
- [ ] Detection compares against `U+10FFFD` and confirms a match by rasterising — measured in the development image as the only two methods that separate drawable from undrawable characters. Comparing against a nonexistent family and asking CDP `CSS.getPlatformFontsForNode` were both measured and rejected: the first reports one width for everything, the second reports `Liberation Sans:2` for characters it cannot draw
- [ ] The check validates its own reference against a second private-use codepoint and reports itself unusable, rather than producing findings, if this machine draws private-use characters
- [ ] `mermaid.mode: pre-render` is measured in its own rendering context, not on the finished HTML, because re-measuring the embedded SVG would not reproduce the font resolution that produced it ([roadmap.md](roadmap.md) 21.2). This is why the setting is top-level `fontCheck`, not `pdf.fontCheck`
- [ ] `fontCheck: warn | error | off` defaults to `warn`, so a heuristic false positive cannot break a build by default; `error` exits non-zero and its user accepts that a false positive stops CI too

**PDF page numbers** ([roadmap.md](roadmap.md) 24.5)

- [ ] Generated PDFs carry page numbers by default, centred, in a form that needs no translation. The header and footer are HTML fragments using Chromium's own `pageNumber` / `totalPages` / `title` / `date` / `url` classes — there is no `{{token}}` syntax — and they set their own font because they inherit none of the document's styles
- [ ] `pdf.header: false` and `pdf.footer: false` each emit an explicitly empty fragment rather than omitting the option, because with `displayHeaderFooter` on Chromium falls back to its own built-in date-and-title header when handed nothing. A replacement fragment renders through Chromium's classes in both positions
- [ ] A margin too small for the default footer warns, with the threshold taken from that fragment's rendered height rather than a chosen number. Measured: Chromium's built-in template stops being drawn between a 10 mm and a 5 mm margin, but a supplied fragment — which is what monodocs uses — is still drawn at 0 mm, so the failure is a footer against the paper edge rather than one that vanishes. A replacement fragment is documented as unchecked, since arbitrary HTML and CSS cannot be judged from the margin value alone

**Decisions and documentation**

- [ ] Docker is recorded as a delivery form that will not be provided, with the same per-release maintenance argument that settled Homebrew / Scoop / winget ([roadmap.md](roadmap.md) 8.3). `Dockerfile.dev` is unaffected
- [ ] The documentation site — commands, configuration, and the CI guide — and its Japanese mirror are updated, since every item above changes something the site documents
- [ ] `verify-published.yml` exercises the new surface (the message language, `init`, and a PDF whose page numbers are actually present) rather than only asserting that a PDF was produced

**Release**

- [ ] Publish `0.10.0-beta.1` to npm under the `next` tag and verify it on Linux x64 and Windows x64 through `verify-published.yml`
- [ ] Verify the release binaries through `verify-release-binaries.yml` and `scripts/verify-windows-binary.ps1`
- [ ] Publish and verify the stable `0.10.0` release, and pin the CI guide on the documentation site to it

## Supported Syntax

The supported syntax for Markdown / AsciiDoc, along with the unsupported items and limitations that come with single-HTML generation, is documented as a specification in [syntax.md](syntax.md) (including footnote ID collision avoidance and in-page anchor handling). Markdown GFM alerts (such as `> [!NOTE]`) and AsciiDoc admonitions are normalized into a common `.admonition` structure for display.

## Known Unsupported Items / Limitations (to be addressed in future versions)

- Code highlighting (shiki) is supported (can be disabled with `highlight.enabled: false`; dual theme follows dark mode)
- Heading-level cross-file links (`file.md#heading` / `xref:other.adoc#sec`) are supported (resolved to the target page's prefixed element ID; because the anchor is matched against the ID the target file generates, pointing from Markdown at an AsciiDoc heading needs the ID Asciidoctor produces, such as `_details`, and an anchor that does not exist falls back to the top of that page with a warning)
- Search matches substrings, now with multiple keywords (AND), field-weighted scoring, heading-level results, and highlighting (v0.8). Because matching is substring-based, Japanese needs no word segmentation. Matching folds case, full-width alphanumerics, katakana against hiragana, and the dash / tilde spellings (v0.9). What it deliberately does not fold is anything that would change string length, because highlight and snippet offsets are shared with the original text: half-width katakana (`ｶﾞ`), okurigana variants (`引き渡し` / `引渡し`, which need a multi-megabyte dictionary), and English stemming — `install` finds a page containing `installing`, but `installing` does not find a page that only says `install` ([roadmap.md](roadmap.md) 22.3)
- `watch` / `serve` monitoring uses `fs.watch` (recursive when possible). If `input` is changed in the configuration, a restart is required. A custom theme directory is watched and follows a theme switch made in the configuration, but it must already exist: a theme directory created (or deleted and recreated) while watching is picked up only on the next source or configuration change. Watching an ancestor directory instead was rejected because it would react to unrelated churn — including the build's own output — and can spin into a rebuild loop
- PDF output is supported (v0.5; `--format pdf` / `both`). Because it uses headless Chromium, Chromium must be present in the runtime environment, and it is not available in the bundled CLI (single `.cjs` / single executable) (the npm-installed version is required). When Mermaid is set to the `cdn` runtime, a network connection is required during PDF generation (use `inline` or `pre-render` to be reliably offline)
- **PDF fonts use the system fonts of the runtime environment.** If a font for a character type appearing in the body is missing, it becomes tofu (□ / ☒) in the PDF (e.g., the emoji ✅ requires an emoji font). The development Docker image already bundles `fonts-noto-cjk` (Japanese) plus `fonts-noto-color-emoji` (emoji). When producing PDFs in your own environment, install fonts according to the character types you use (HTML is unaffected because it uses the browser's fonts). Nothing in the build checks this yet, so a forgotten font produces a successful build and an unreadable PDF; v0.10 adds a warning ([roadmap.md](roadmap.md) 24.3.3). HTML escapes this only because it uses the reader's fonts — `mermaid.mode: pre-render` does not, since it bakes the build machine's fonts into the SVG
- Input is assumed to be trusted documents (AsciiDoc raw HTML is not sanitized; see [development.md](development.md) for details)

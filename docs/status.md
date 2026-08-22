# Implementation Status

[日本語](ja/status.md)

Last updated: 2026-08-22

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
| Language, `init`, PDF fonts and page numbers      | ✅ Done   | v0.10          |
| Page breaks (marker, `pdf.pageBreakLevel`)        | 🚧 Planned| v0.11          |

The VS Code extension is frozen and not scheduled: demand is unknown, the release and Marketplace pipeline is
disproportionate for a single maintainer, and the boundary between the extension and `@monodocs/core` is still
undecided. The reasoning is recorded under v0.7 in [roadmap.md](roadmap.md). v0.8 was worked on in its place,
and it, v0.9, and v0.10 are released.

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

- [x] `--help` — including the `Usage:` / `Options:` / `Commands:` headings Commander generates, reached through `configureHelp` / `addHelpText` — and every error and warning read in English by default, and in Japanese under `--lang ja` or `MONODOCS_LANG=ja`. The flag wins over the environment variable; an unsupported value is rejected naming the supported ones rather than falling back silently. `LANG` / `LC_ALL` are deliberately not consulted, so a build log does not depend on the machine that produced it ([roadmap.md](roadmap.md) 25.6)
- [x] The catalogue covers every string monodocs itself emits and a test fails when a new one is added outside it. A message that reaches the user unwrapped from a dependency (a Zod parse error, a Puppeteer stack) is out of scope; where monodocs already wraps one, the wrapper is translated. The boundary is written down

**Document language and UI labels** ([roadmap.md](roadmap.md) 23.4)

- [x] The top-level `lang` key sets both `<html lang>` and the UI labels, defaulting to `en`, so the output no longer declares one language while displaying another. This reverses the English-only label decision recorded in [architecture.md](architecture.md) and [development.md](development.md), both updated rather than left contradicting the roadmap. Anyone who relied on the previously hardcoded `<html lang="ja">` sees it change — a breaking change taken before 1.0
- [x] `lang` accepts any syntactically valid BCP 47 tag and rejects anything else instead of writing it into the attribute. Matching is case-insensitive on the primary language subtag (`en-GB`, `JA` → `en`, `ja`); a tag with no shipped table — including a wholly private-use `x-…` or a grandfathered tag, which have no subtag to match — falls back to the English labels and warns once per build, naming the tag
- [x] Core resolves the table and applies `html.labels` over it, publishing the result in `{{siteDataJson}}`; `app.js` consumes that rather than holding its own copy, so a table and an override cannot drift apart
- [x] `en` and `ja` tables are complete over the enumerated key set — a key missing from either is a build failure, not a silent fallback — and the key set is listed in the configuration reference because 1.0 freezes it. An unknown `html.labels` key is rejected rather than ignored
- [x] Label values are escaped per destination: HTML text, attributes such as `title` / `aria-label`, and the JSON of `siteDataJson` each need different treatment, and a value containing `<` or a quote reaches all three intact
- [x] The theme guarantee is implemented and documented as four distinct degrees, not one: every theme gets the labels as data in `{{siteDataJson}}`; the default `app.js` applies them to the default template's DOM hooks; a theme replacing `app.js` applies them itself; static text a custom `template.html` spells out stays as written. `{{lang}}` is an optional token, so a template hardcoding `<html lang>` keeps what it wrote

**`monodocs init`** ([roadmap.md](roadmap.md) 25.1)

- [x] Writes `monodocs.config.yml` and `docs/index.md` that build without editing; when either already exists it writes neither and names what it found — everything it found, not the first one. The generated configuration is a short commented starting point rather than a dump of every key, and points at the configuration page for the rest
- [x] The whole scaffold follows the message language, the `lang` it writes included, not only its comments: the first page is prose in that language, so `--lang ja` writes a Japanese page under `lang: "ja"`. Writing the default `en` there would publish a Japanese document declaring English — the mismatch [roadmap.md](roadmap.md) 23.4 exists to end

**Font checking** ([roadmap.md](roadmap.md) 24.3.3)

- [x] A build on a machine missing a font the document needs warns, naming the clusters at risk and an example font that covers them from a built-in script-to-example table — not a package name, which differs across platforms. A document needing nothing the machine lacks stays silent
- [x] The unit is the grapheme cluster paired with the computed font of the element it appears in, not a codepoint and not one representative character per script; the cluster is measured first and its codepoints only when the cluster is not itself one notdef box, so a sequence that falls apart into several tofu is caught as well as one that comes out as a single box. A sequence whose codepoints all draw and which the font merely declines to compose is out of scope, with its reason ([roadmap.md](roadmap.md) 24.3.3). The check runs after `document.fonts.ready`
- [x] Detection compares against `U+10FFFD` and confirms a match by rasterising — measured in the development image as the only two methods that separate drawable from undrawable characters. Comparing against a nonexistent family and asking CDP `CSS.getPlatformFontsForNode` were both measured and rejected: the first reports one width for everything, the second reports `Liberation Sans:2` for characters it cannot draw
- [x] The check validates its own reference against two controls — a second private-use codepoint from another plane, and a noncharacter — and reports itself unusable, rather than producing findings, if any of them disagree. The noncharacter is what makes this mean anything: two private-use codepoints agreeing only proves they render alike, which a font mapping both to one glyph also does, and the check would then pass a document while seeing nothing ([roadmap.md](roadmap.md) 24.3.3)
- [x] A walk that reaches its ceiling (50,000 distinct cluster/font pairs) says so instead of returning a clean bill, because a check that was cut short reads exactly like one that passed
- [x] `mermaid.mode: pre-render` is measured in its own rendering context, not on the finished HTML, because re-measuring the embedded SVG would not reproduce the font resolution that produced it ([roadmap.md](roadmap.md) 21.2). This is why the setting is top-level `fontCheck`, not `pdf.fontCheck`
- [x] `fontCheck: warn | error | off` defaults to `warn`, so a heuristic false positive cannot break a build by default; `error` exits non-zero and its user accepts that a false positive stops CI too
- [x] Only what will be drawn is measured: the PDF is checked under print emulation, with `display: none` and `content-visibility: hidden` subtrees pruned and the text of a `visibility: hidden` element skipped (its subtree is not, because `visibility` inherits and a descendant can turn it back on), so the sidebar, the table of contents, and the search results — none of which reach the paper — cannot produce a finding. The root element is checked separately, because a `TreeWalker` never runs its filter on its root and `display` does not inherit. The default page-number footer is measured in a context of its own; a replacement fragment is not, the same line `pdf.margin` already draws

**PDF page numbers** ([roadmap.md](roadmap.md) 24.5)

- [x] Generated PDFs carry page numbers by default, centred, in a form that needs no translation. The header and footer are HTML fragments using Chromium's own `pageNumber` / `totalPages` / `title` / `date` / `url` classes — there is no `{{token}}` syntax — and they set their own font because they inherit none of the document's styles
- [x] `pdf.header: false` and `pdf.footer: false` each emit an explicitly empty fragment rather than omitting the option, because with `displayHeaderFooter` on Chromium falls back to its own built-in date-and-title header when handed nothing. A replacement fragment renders through Chromium's classes in both positions
- [x] A margin too small for the default footer warns, with the threshold taken from that fragment's rendered height rather than a chosen number. Measured: Chromium's built-in template stops being drawn between a 10 mm and a 5 mm margin, but a supplied fragment — which is what monodocs uses — is still drawn at 0 mm, so the failure is a footer against the paper edge rather than one that vanishes. A replacement fragment is documented as unchecked, since arbitrary HTML and CSS cannot be judged from the margin value alone

**Findings from the first outside use of a release**

- [x] An unknown key fails the build wherever it sits, top level included, and the error names the key and the object holding it (`pdf: Unrecognized key: "footr"`) instead of reproducing the validator's issue array as JSON. Until v0.10 only `sidebar`, `pdf`, and `html.labels` were strict, so whether a misspelling was caught depended on its depth — and accepted-and-ignored is the worse half of that pair, since the file looks right and only the output says otherwise ([roadmap.md](roadmap.md) 12.2)
- [x] `sources.exclude` adds to the built-in exclude list rather than replacing it, and `sources.excludeDefaults: false` drops that list for a tree that really does bundle its `_`-prefixed files. The key moved from `sidebar.exclude`, which was never a sidebar setting — a match never becomes a page at all; the old key still builds, merged the same way, and warns where it went ([roadmap.md](roadmap.md) 12.3)
- [x] A single file is a valid input (`monodocs build ./docs/plan.md`), read as a one-page document with the directory holding it as the base for links, images, and `monodocs.config.yml`. The exclude patterns do not apply to a file named on the command line. A path whose extension no renderer claims is refused naming the extensions that work, rather than reaching `readdir` and surfacing Node's `ENOTDIR` ([roadmap.md](roadmap.md) 25.2)
- [x] Printed tables use `table-layout: auto`, so each column takes the width its contents need instead of an equal share of the page, while the cells' `overflow-wrap: anywhere` keeps the table inside the page — the truncation the print block exists to prevent ([roadmap.md](roadmap.md) 24.3.1)

**Page density** ([roadmap.md](roadmap.md) 24.6)

- [x] `pdf.density` takes a preset name (`relaxed` / `normal` / `compact` / `tight`) or an object, and moves the four values that decide a page count: root font size, leading, the space above headings, and table cell padding. The documentation set in `examples/ja` comes out as 56, 49, 44, and 40 sheets across the four. `pdf.margin`, the only lever before, left an A4 business document at nine pages across its whole useful range
- [x] The object form starts from the preset named by `base` (default `normal`) and replaces only what it names, so adjusting one value does not mean copying the rest and a retuned preset still carries — the resolution order `html.labels` already uses over the table `lang` chose
- [x] The default is set for paper rather than for a screen: `relaxed` and `normal` set the same 16px body, and the 56 sheets between them come down to 49 on leading, heading spacing, and cell padding alone — as many as the first version of `compact` bought by dropping the type to 13.5px. Type size only moves below the default, because the measure is whatever `pdf.margin` leaves and smaller type is a longer line (about 42 Japanese characters at 16px in the default A4 margins, 56 at 12px)
- [x] `relaxed` is the screen setting under a name, which is what lets the default move: the two were one table before, and neither could change without the other. Only what differs from the screen — a separate constant, not the default preset — is ever written, so `relaxed` emits no rules at all and the default emits no font size, leaving the reader's own base size in place when they print the HTML from a browser
- [x] The documentation site shows the four rather than describing them: one short source per language in `site/samples/density/`, built four times with nothing else changed, published as PDFs whose own first pages are the thumbnails beside them
- [x] A preset rather than Puppeteer's `page.pdf({ scale })`: scale photographs the finished page smaller, keeping line breaks and column widths decided at the original size, while a density sets the page at the size it will be read. In a document made largely of tables that is the difference that matters
- [x] Values are validated as plainly a number and a unit — `calc(...)` or anything carrying a `;` is refused — at the configuration boundary and again at `renderSingleHtml`, which is a public entry point of its own. No measure and no arbitrary-CSS hook: the column width belongs to `pdf.margin`, and a closed key set is what 1.0 can freeze

**Decisions and documentation**

- [x] Docker is recorded as a delivery form that will not be provided, with the same per-release maintenance argument that settled Homebrew / Scoop / winget ([roadmap.md](roadmap.md) 8.3). `Dockerfile.dev` is unaffected
- [x] The documentation site — commands, configuration, and the CI guide — and its Japanese mirror are updated, since every item above changes something the site documents
- [x] `verify-published.yml` exercises the new surface rather than only asserting that a PDF was produced: the message language (English by default, Japanese under the flag and under `MONODOCS_LANG`, the flag winning, an unsupported value rejected naming the supported ones), `init` (the scaffold built unedited, a second run refusing and naming what it found, `--lang ja` writing `lang: "ja"`), a PDF whose page numbers are read back off the page through each font's `ToUnicode` map by [`scripts/assert-pdf-page-numbers.mjs`](../scripts/assert-pdf-page-numbers.mjs) — asserted present with the default footer and absent under `pdf.footer: false` — and the font check reporting a character no font anywhere covers. The steps that need 0.10 are gated on the installed version, so the workflow can still verify 0.9

**Release**

- [x] Publish `0.10.0-beta.1` to npm under the `next` tag and verify it on Linux x64 and Windows x64 through `verify-published.yml`
- [x] Verify the release binaries through `verify-release-binaries.yml` on both platforms, and run [`scripts/verify-linux-binary.sh`](../scripts/verify-linux-binary.sh) on a Linux x64 host without Node.js — the environment a binary release makes its claim about, and the one no CI job in this repository provides ([maintenance.md](maintenance.md)). Sixteen checks pass: the asset gated on its `.sha256`, the CLI surface, `validate`, a build with `-o` omitted writing `dist/docs.html`, self-contained HTML, a build from a path containing spaces, PDF and Mermaid pre-render failing with the guidance to switch to the npm build, the NOTICES file, and the long-running `serve` / `watch` — live reload broadcast over SSE and a rebuild from an edit in a subdirectory included
- [ ] Verify the Windows x64 release binary by hand with [`scripts/verify-windows-binary.ps1`](../scripts/verify-windows-binary.ps1) on a host without Node.js, and finish the checks both scripts leave to a person: the browser pass over the generated HTML (sidebar, search, dark mode, the narrow-width drawer), `serve --open`, and Mark of the Web and SmartScreen on Windows
- [x] Publish and verify the stable `0.10.0` release, and pin the CI guide on the documentation site to it: published from CI on the `v0.10.0` tag and carrying the `latest` dist-tag, verified through `verify-published.yml` and `verify-release-binaries.yml` on Linux x64 and Windows x64, with the CI guide on the site — English and Japanese alike — pinning `monodocs@0.10.0`

### v0.11: Page Breaks

[roadmap.md](roadmap.md) defines this milestone; the list below tracks it.

**The marker** ([roadmap.md](roadmap.md) 24.7)

- [x] `<<<` in AsciiDoc starts a new sheet. Asciidoctor already emits it as `<div class="page-break"></div>` and it already reaches the single HTML; what is missing is a rule that matches the class
- [x] `<div class="page-break"></div>` in Markdown does the same, with `<div style="page-break-after: always"></div>` accepted as the same marker and normalised to the class form. The spelling is the one Typora, the Markdown-to-PDF converters, the MkDocs PDF plugins, and a browser's print dialog already understand, and the class name is Asciidoctor's rather than one monodocs chose, so one rule serves both formats
- [x] Markdown does not gain raw HTML. The mdast `html` node is matched against the two spellings — in the quoting and ASCII-whitespace variants the configuration reference enumerates for the reader, since 1.0 freezes them — before `remark-rehype`, and the element that reaches the output is built by monodocs — a `div`, one class, no children — rather than re-emitted from the input, so no attribute or script can ride in on it
- [x] `<DIV>`, `class="page-break foo"`, a second attribute, `<div class="page-break"/>`, whitespace between the tags, a `style` carrying anything more, and a marker inside a blockquote, a list item, a table cell, or a heading are all rejected rather than repaired, and stay dropped as every other raw HTML in Markdown is. A test asserts that a `<script>` is still dropped
- [x] `break-after: page`, not `break-before`, from measurement: the marker is an empty box, so a break in front of it moves the box itself onto the new sheet, and a two-page document whose first page ends with a marker costs three sheets under `break-before` and two under `break-after`. Every other case measured the same under both, and a marker with nothing behind it leaves one blank sheet either way — which is what it asks for ([roadmap.md](roadmap.md) 24.7)

**`pdf.pageBreakLevel`** ([roadmap.md](roadmap.md) 24.7)

- [x] Takes `false` (the default) or 2–6, where the number is the deepest heading level that starts a new sheet: `2` is h2 only, `6` is h2 through h6. h1 is not a level here, because the file it titles has already broken. `false` rather than `"off"`, matching `pdf.header` / `pdf.footer`, which already use `false` to turn a feature off — `fontCheck: warn | error | off` is an enumeration of behaviours, which this is not
- [x] A heading breaks unless nothing renders before it, or the only thing that does is the page's h1. "The first heading of the page" is the wrong rule: a page opening with its title, an introduction, and then its first section must break before that section, because the introduction belongs on the title's sheet
- [x] Headings inside a block carrying `break-inside: avoid` — a table, a figure, a code block, an admonition, a blockquote ([roadmap.md](roadmap.md) 24.3.1) — are not candidates, so Chromium is never asked to keep a block together and split before something inside it at once
- [x] The headings that break are marked in post-processing with `data-monodocs-pdf-break-before`, and one rule matches the attribute. A CSS-only selector would have to enumerate both the flat body Markdown produces and the `.sect1`–`.sect5` nesting Asciidoctor produces, and would still misread a page whose h1 is missing or whose first heading is an h3. The attribute is namespaced because a custom theme and an AsciiDoc passthrough can both put attributes on a heading

**Where the rules live**

- [x] The marker rule is emitted by core into the print stylesheet, beside the density rules, and names `#content` and `.page` alike, so replacing `style.css` cannot delete a syntax feature ([roadmap.md](roadmap.md) 24.6). The heading rule follows the same way
- [x] The heading rule is emitted the same way
- [x] The default `false` emits no heading rule at all, and neither rule reaches the screen stylesheet

**Measured rather than assumed**

- [x] A marker immediately followed by a heading that would break produces one break, not a blank sheet between them. Measured: Chromium does not collapse two adjacent forced breaks — two markers in a row leave a sheet between them — so post-processing does not mark a heading whose nearest preceding content is a marker
- [x] The space above a heading that starts a sheet is measured against `pdf.density`: Chromium keeps it across a forced break, putting the heading 15.8pt lower at `relaxed` than at `normal`, so the rule zeroes it with `margin-top: 0` — the same property the density rule writes. The standard [roadmap.md](roadmap.md) 24.6 set for a value that reaches the page

**Found while measuring** ([roadmap.md](roadmap.md) 24.3.4)

- [x] A document short enough for one sheet comes out on one. It used to come out on two, the second empty but for the page number: `html, body { height: 100% }` and `#app { min-height: 100vh }` — two rules that exist to fill a screen — meeting the destination anchor `pdf.bookmarks` inserts. Measured, turning off either one in print leaves the document at two sheets and only turning off both brings it to one; a 49-sheet document is unchanged, which is what says a blank sheet was removed rather than a sheet of content

**Tests and documentation**

- [x] The PDF assertions are page counts read from the produced PDF, the form the density tests already use. `h1 → h2 → body → h2` under `pageBreakLevel: 2` comes out as exactly two sheets — one sheet means the feature is dead, three means the leading-heading rule is wrong — and the same document under the default comes out as one. Both formats are covered
- [x] [syntax.md](syntax.md) stops saying that raw HTML in Markdown is dropped without exception, and says instead that the two page-break spellings are recognised as a control marker and normalised, with the input never reaching the output. [architecture.md](architecture.md) records the same boundary
- [x] The configuration reference on the documentation site documents the marker and the key, with its Japanese mirror, and [testing.md](testing.md) lists the new tests. The site has no syntax page of its own — [syntax.md](syntax.md) is where the repository keeps that specification, and it is updated above

## Supported Syntax

The supported syntax for Markdown / AsciiDoc, along with the unsupported items and limitations that come with single-HTML generation, is documented as a specification in [syntax.md](syntax.md) (including footnote ID collision avoidance and in-page anchor handling). Markdown GFM alerts (such as `> [!NOTE]`) and AsciiDoc admonitions are normalized into a common `.admonition` structure for display.

## Known Unsupported Items / Limitations (to be addressed in future versions)

- Code highlighting (shiki) is supported (can be disabled with `highlight.enabled: false`; dual theme follows dark mode)
- Heading-level cross-file links (`file.md#heading` / `xref:other.adoc#sec`) are supported (resolved to the target page's prefixed element ID; because the anchor is matched against the ID the target file generates, pointing from Markdown at an AsciiDoc heading needs the ID Asciidoctor produces, such as `_details`, and an anchor that does not exist falls back to the top of that page with a warning)
- Search matches substrings, now with multiple keywords (AND), field-weighted scoring, heading-level results, and highlighting (v0.8). Because matching is substring-based, Japanese needs no word segmentation. Matching folds case, full-width alphanumerics, katakana against hiragana, and the dash / tilde spellings (v0.9). What it deliberately does not fold is anything that would change string length, because highlight and snippet offsets are shared with the original text: half-width katakana (`ｶﾞ`), okurigana variants (`引き渡し` / `引渡し`, which need a multi-megabyte dictionary), and English stemming — `install` finds a page containing `installing`, but `installing` does not find a page that only says `install` ([roadmap.md](roadmap.md) 22.3)
- `watch` / `serve` monitoring uses `fs.watch` (recursive when possible). If `input` is changed in the configuration, a restart is required. A custom theme directory is watched and follows a theme switch made in the configuration, but it must already exist: a theme directory created (or deleted and recreated) while watching is picked up only on the next source or configuration change. Watching an ancestor directory instead was rejected because it would react to unrelated churn — including the build's own output — and can spin into a rebuild loop
- PDF output is supported (v0.5; `--format pdf` / `both`). Because it uses headless Chromium, Chromium must be present in the runtime environment, and it is not available in the bundled CLI (single `.cjs` / single executable) (the npm-installed version is required). When Mermaid is set to the `cdn` runtime, a network connection is required during PDF generation (use `inline` or `pre-render` to be reliably offline)
- **PDF fonts use the system fonts of the runtime environment.** If a font for a character type appearing in the body is missing, it becomes tofu (□ / ☒) in the PDF (e.g., the emoji ✅ requires an emoji font). The development Docker image already bundles `fonts-noto-cjk` (Japanese) plus `fonts-noto-color-emoji` (emoji). When producing PDFs in your own environment, install fonts according to the character types you use (HTML is unaffected because it uses the browser's fonts). Since v0.10 the build measures what the document actually needs and warns, naming the characters at risk and an example font that covers them (`fontCheck: warn | error | off`, default `warn`; [roadmap.md](roadmap.md) 24.3.3) — a forgotten font no longer produces a successful build and an unreadable PDF in silence. It remains a heuristic over the browser's font fallback, which is why the default warns rather than fails. HTML escapes this only because it uses the reader's fonts — `mermaid.mode: pre-render` does not, since it bakes the build machine's fonts into the SVG, and is covered by the same check
- Input is assumed to be trusted documents (AsciiDoc raw HTML is not sanitized; see [development.md](development.md) for details)

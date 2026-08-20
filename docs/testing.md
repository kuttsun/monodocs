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

## Test Results (as of 2026-07-28)

| Item           | Result     |
| -------------- | ---------- |
| Test Files     | 31 passed  |
| Tests          | 287 passed |
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
- `pipeline/buildSidebar.custom.test.ts` … custom sidebar (`sidebar.items` structure/order/titles, `./` and backslash paths, error for a missing path, warnings for unlisted, hidden, and duplicated pages, a group emptied of pages, and reading order via `orderPagesBySidebar`)
- `pipeline/postprocess.test.ts` … link conversion (including cross-file anchors: resolution to the target page's prefixed element ID, percent-encoded anchors, rejection of an ID that belongs to another page, page-top fallback with a warning for a missing anchor), image data URI embedding, Mermaid conversion (client / pre-render SVG conversion, globally unique ids, verbatim preservation of complex SVG, per-diagram error source fallback, fail fast on environment errors `BrowserSetupError` (including `MermaidPrerenderSetupError`), renderer-not-injected error), shiki code highlighting, common structuring of admonition / GFM alert
- `pipeline/renderSingleHtml.test.ts` … href encoding, HTML escaping, optional content-width control and initial state, optional image lightbox markup, branding footer/version escaping, client page data (all h2+ headings and `tocMaxLevel` for the table of contents/search), single-pass token substitution that leaves token-like text in page content and theme assets untouched
- `themes/index.test.ts` … theme loading (built-in name, unknown name rejected with the built-in list, custom directory, per-file fallback to the default theme, directory holding no theme files, template missing required tokens)
- `themes/default/app.test.ts` … client hash routing (happy-dom)
- `themes/default/app.search.test.ts` … v0.8 search (AND across multiple keywords, field-weighted ranking, heading-level results linking to the heading and keeping that anchor in the hash on click, keyword highlighting in title/heading/snippet, headings below `toc.maxLevel` searchable but hidden from the table of contents, case and full-width folding, keywords separated by an ideographic space) and v0.9 folding (katakana against hiragana in both directions, prolonged-sound/dash variants treated as one character, highlighting still marking the original spelling, half-width katakana left unmatched as the documented boundary) and v0.9 keyboard navigation (combobox/listbox roles and `aria-expanded`, arrow keys wrapping at both ends with focus kept in the input and the selection published through `aria-activedescendant`, selection cleared when the query changes, `Enter` opening the selected result and the top result when none is selected, `Enter` left alone when there is no result, keys left to the IME while composing including the `keyCode` 229 fallback, option IDs kept clear of IDs the document already uses) and v0.9 in-body highlighting (nothing marked until a result is opened, every occurrence marked in the page the result opens and only there, the same folding as the result list, the highlight following the reader while the search stays open, Mermaid source / injected UI text / the page's own `<mark>` left alone, content carrying the same class left alone while a keyword inside it is marked in place, the mark cap across many nodes and within a single huge one, and the body restored to the same structure and node count when the query changes or `Escape` clears the box) (happy-dom)
- `themes/default/app.mobile.test.ts` … narrow-viewport sidebar drawer (opens from the toggle, closes after following a link, closes on Escape and on an outside click, and stays permanent on wide viewports) (happy-dom)
- `themes/default/app.v04.test.ts` … search, in-page table of contents, prev/next navigation, dark mode, persistent content-width toggle and configured initial state, sidebar collapse, code block copy/wrap toggle, image lightbox mouse/keyboard/focus behavior and linked/decorative-image exclusion (happy-dom)
- `messages.test.ts` … the message catalogue (English by default, the flag winning over `MONODOCS_LANG`, an unsupported value rejected naming the supported ones, both shipped languages complete over the key set and carrying the same placeholders, and a placeholder with no value left in place rather than blanked). It also scans both packages' sources and fails when an emitting call is handed a string literal instead of `t(...)`, which is what keeps the catalogue from quietly growing holes. The scan runs over whole files rather than line by line, so a call with its argument on the next line is still seen; it matches any `Error` subclass rather than a list of names, so a new one is not missed; and it checks the description position of Commander's `.option` / `.argument` / `.helpOption` / `.helpCommand` / `.addHelpText`, where the first argument is legitimately a literal. It asserts it found files before concluding anything, and each of those three cases was confirmed to fail against an injected literal
- `labels.test.ts` … the UI label catalogue (BCP 47 tags accepted and rejected, both shipped tables complete over the key set, case-insensitive primary-subtag matching, fallback to English with a warning naming the tag for a tag with no table and for one with no subtag to match, and overrides applied on top of either)
- `build.lang.test.ts` … document language and labels end to end (English by default, `lang: ja` producing `<html lang="ja">` and Japanese in both the template and `siteDataJson`, a tag with no table reaching the attribute while the labels fall back and warn once, `html.labels` replacing entries and supplying an unshipped language, an unknown label key and an invalid `lang` rejected, a label containing markup or a quote escaped in every destination, and the theme guarantee at its two interesting degrees — a custom `template.html` keeping its own static text and its own `<html lang>` while tokens resolve, and a custom `app.js` still receiving the labels as data)
- `build.pdfdensity.test.ts` … `pdf.density` (presets resolved by name, the object form starting from `base` and replacing only what it names, a line height accepted as a number or a string, and values that are not plainly a number and a unit refused — including `calc(...)`, a trailing declaration, an unknown preset name, and an unknown key). The generated stylesheet is checked for what it does *not* say: the default writes no rules at all, and an object naming one value leaves the others unpinned. The claim the feature exists for is a page count, so with a real Chromium it builds the same document at each preset and reads the counts back with pdf-lib, asserting the ladder is monotonic and that `normal` lands on exactly the same paper as saying nothing
- `build.pdfbands.test.ts` … the PDF header and footer bands (page numbers in the footer and an empty header by default, `false` emitting an explicitly empty fragment rather than omitting the option, a replacement fragment reaching both positions, and an empty string rejected). The band actually being drawn is confirmed only in environments with a real Chromium, by decoding the page content streams and reading the glyphs back through the `ToUnicode` map of whichever font `Tf` selected — counting text-showing operators alone would pass even if the substitution broke and only the separator were drawn. The fixture body carries no digits, so the digits a page draws can only come from the band, and the assertion is that they are exactly that page's number and the total. The same half covers the footer being centred in the band, the margin warning firing, its silence for a fitting margin and for a replacement fragment, and that the measured threshold does not move when the document's own stylesheet would otherwise inflate it
- `themes/default/app.labels.test.ts` … the client applying the labels core published (prev/next, the empty-search message, the code block and image controls, and the result list all taking their wording from `siteDataJson`). The values it passes are deliberately unlike the English table: asserting the English defaults would pass just as well against a client that kept its own copy, which is the drift this design removes. A label containing markup is escaped rather than parsed, since it reaches `innerHTML` from a configuration file (happy-dom)
- `themes/default/app.shortcut.test.ts` … the search focus shortcut (`/` and `Ctrl+K` / `⌘K` reaching the box and selecting what is already in it, both keys left alone while the reader types in a field with `⌘K` the exception, keys left to the IME while composing including the `keyCode` 229 fallback, other modifier combinations on K and a bare `K` ignored, the physical K position answering only on a layout that produces no Latin letter there, `/` typed with AltGr answering, the sidebar opened first when it is collapsed or a closed drawer, the drawer closed when a result is opened with `Enter` and focus handed to the re-open button when `Escape` closes it, and focus left alone behind an open modal) (happy-dom)
- `themes/default/print.test.ts` … printed table columns (a label column against a sentence column keeps well under half the page and stays narrower than the sentences, and the table still fits inside the page). `table-layout: fixed` would split the width evenly whatever the contents are, and nothing in the produced HTML shows that: column widths are a layout computation, so happy-dom reports zeroes and the file is confirmed only in environments with a real Chromium, under `emulateMediaType("print")`
- `themes/default/layout.test.ts` … sidebar reachability (the search box stays in place while the navigation tree scrolls to its end, a viewport too short for the column falls back to scrolling the whole sidebar rather than clipping the tree, and the search shortcut lands focus in the box from a collapsed sidebar and from a closed drawer). Reachability is decided by hit-testing rather than by element rectangles, which ignore clipping by an ancestor; the shortcut cases first measure their own premise, that a hidden box refuses focus. This is CSS layout, so happy-dom cannot see it and the file is confirmed only in environments with a real Chromium
- `build.test.ts` / `build.mixed.test.ts` / `build.v03.test.ts` … e2e (Markdown / mixed / v0.3 features, validate)
- `build.sidebar-custom.test.ts` … e2e (custom sidebar rendering and order, page order driving prev/next and the initial page, unlisted-page warning, `validate` error for a missing path)
- `build.theme.test.ts` … e2e (custom theme: `html.theme` resolved against the config file, style-only theme keeping the default template and client, full theme replacing template and client, broken template failing the build, `validate` unaffected by the theme, and `watch` following the theme directory across a config-driven theme switch, including a switch to a temporarily broken theme)
- `build.anchors.test.ts` … e2e (cross-file heading anchors in both directions between Markdown and AsciiDoc, footnote anchors, `validate` warning for an anchor that does not exist)
- `build.mermaid-prerender.test.ts` … Mermaid pre-render (verifies config integration and SVG embedding via fake renderer injection; end-to-end rendering and runtime-not-injected gating are confirmed only in environments with a real Chromium)
- `build.v04.test.ts` … e2e (`watchSite` rebuild, `serveSite` delivery and live-reload injection, `serveSite` serving HTML even with pdf/both configuration and respecting an explicit `-o`)
- `build.input-file.test.ts` … e2e (a single Markdown or AsciiDoc file as the input: one page built from it, the configuration read from the directory holding it, a relative image resolved and embedded against that same directory, a `_`-prefixed file bundled when it is named directly because the exclude patterns are a scanning rule rather than a bundling one, `validate` covering the same path, an unsupported extension refused naming the ones that work, and a path that does not exist still reported as not found)
- `build.pdf.test.ts` … PDF output (v0.5. browserless verification of `resolveOutputs` html/pdf/both output path resolution, format branching and configuration (pageSize/margin/printBackground) integration via fake `PdfGenerator` injection, embedImages override, bookmark outline passing. Actual PDF generation = `%PDF-`, `/Outlines`, `/UseOutlines`, internal link annotations for cross-page links, and a cross-file heading anchor landing on the heading rather than the page top, confirmed only in environments with a real Chromium)
- `pipeline/pdfMetadata.test.ts` … PDF document information (title and monodocs as Creator/Producer replacing the browser and pdf-lib defaults, the DisplayDocTitle viewer preference, pages preserved, no-op when nothing is set. pdf-lib only, browserless)
- `pipeline/pdfOutline.test.ts` … PDF bookmarks (`sidebarToOutline` tree conversion, `collectDests`/`remapDests`, `addOutline` referencing `/Dests` to build folder→page `/Outlines` and set `/UseOutlines`. Destinations absent / empty tree returns the original PDF. pdf-lib only, browserless)
- `config.test.ts` … configuration resolution (including content-width, image-lightbox, and branding defaults/toggles, `pdf` schema defaults, completion of missing margins, rejection of invalid `--format`, and default output paths per format). It also covers what is excluded from the bundle — `sources.exclude` adding to the built-in list rather than replacing it, `sources.excludeDefaults: false` dropping that list, the deprecated `sidebar.exclude` still honoured and merged with a warning, and both spellings at once refused — and unknown keys at every depth, including the top level, with the error naming the key and the object holding it rather than dumping the validator's issue array

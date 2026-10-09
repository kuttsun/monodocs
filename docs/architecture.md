# Architecture

[日本語](ja/architecture.md)

`monodocs` combines multiple Markdown and AsciiDoc sources into one self-contained HTML document and can
optionally render it as PDF. It is a lightweight generator for single-file distribution, not a replacement for
Pandoc. See [roadmap.md](roadmap.md) for the specification and [status.md](status.md) for implementation status.

## Source Renderer Architecture

Each source format has its own renderer; results are normalized into the shared `Page` model before output is
generated. Do not route Markdown and AsciiDoc through a shared renderer. Shared types live in
[`app/packages/core/src/types.ts`](../app/packages/core/src/types.ts).

The central build function is `preparePages()` in [`build.ts`](../app/packages/core/src/build.ts), shared by
`buildSite` and `validateSite`:

```text
loadConfig (config.ts)
  -> scanSourceFiles (scan.ts)           scan inputs, detect formats, apply exclusions
  -> buildPages (pipeline/buildPages.ts) render with each SourceRenderer and normalize to Page[]
  -> buildSidebar (pipeline/buildSidebar.ts)
                                         build the sidebar tree from the directory structure
                                         (numberSidebar numbers it under numbering.sections)
  -> postprocessPages (pipeline/postprocess.ts)
                                         rewrite links, embed images, transform Mermaid,
                                         apply Shiki highlighting, and number headings on HAST
  -> renderSingleHtml (pipeline/renderSingleHtml.ts)
                                         inject content into the template
  -> writeOutput (build.ts)
```

The renderers are [`sources/markdown/renderer.ts`](../app/packages/core/src/sources/markdown/renderer.ts) and
[`sources/asciidoc/renderer.ts`](../app/packages/core/src/sources/asciidoc/renderer.ts); both implement
`SourceRenderer` (`extractMeta` and `render`). [`sources/meta.ts`](../app/packages/core/src/sources/meta.ts)
normalizes frontmatter and `:sd-*:` attributes into `PageMeta`.

Highlighting must depend on the block alone, or a `watch` rebuild differs from the first build. Shiki's shorthand
shares one highlighter per process and loads languages on demand, so an embedding grammar (AsciiDoc, Markdown)
highlights an embedded language only if something already loaded it, and an injecting grammar (`lit` into
JavaScript's tagged templates) reaches only grammars first used after it was loaded. Therefore `postprocess.ts`:

- before highlighting, loads each language transitively with every language its grammar can embed and every
  grammar that injects into one of its scopes or a dot-prefix of one (Shiki applies `source.js` injections to
  `source.js.jsx`);
- highlights through the highlighter instance, not the shorthand, which loads languages it guesses from the code;
- registers injection carriers that can compete as a group, in a fixed order, the first time any of them is
  needed, because injections matching at the same place are tried in registration order (Vue's and Angular's
  both match `{{`).

`sources.lineBreak` is applied inside each renderer through one shared helper
([`sources/lineBreak.ts`](../app/packages/core/src/sources/lineBreak.ts)), before `prefixIdsAndCollect` collects
the page's text.

> [!WARNING]
> Do not move `sources.lineBreak` into `postprocessPages`. It re-parses `page.html` but does not recompute
> `page.text`, so the search index would no longer match the HTML.

## Single-HTML Invariants

### IDs and anchors

All sources share one HTML document, so every element ID must be globally unique.

- Prefix source-generated IDs, including generated ones such as footnotes, with `{page-id}-`.
- Both renderers use `prefixIdsAndCollect` from
  [`sources/prefixIds.ts`](../app/packages/core/src/sources/prefixIds.ts) to prefix IDs, rewrite same-page
  anchors, and collect headings and searchable text.
- `buildPages` must reject route collisions and page-ID collisions (for example, `a-b.md` and `a/b.md` produce
  the same page ID).
- Section numbers (`numbering.sections`) are labels, never addresses:
  - They are decided from the sidebar the reader sees, on the shared `Page` model rather than in either
    renderer, and written into the heading as a `.section-number` element in post-processing. This is why the
    sidebar, which needs only titles and paths, is built before post-processing.
  - Routes, page IDs, heading IDs, `page.text`, and heading text stay exactly as without numbering.
  - The client receives the number beside the title and heading text, never inside them, so search matches a
    number as a whole and digits cannot change how a word scores. Among results alike in matching every
    term exactly or not ([roadmap.md](roadmap.md) 22.3), one whose number matched is listed before any that did not.
  - The span core writes carries `data-monodocs-section-number`, so the client leaves those digits out of the
    in-body highlight without touching a document's own markup that uses the class.
  - AsciiDoc `:sectnums:` is refused while numbering is on, by asking Asciidoctor which sections it numbered
    rather than reading the attribute.

### Routing and link rewriting

- Generate routes from relative paths without extensions and map `index` to `/`.
- Use hash routes such as `#/setup/install` for pseudo-page navigation.
- Store an `encodeURI`-encoded value in `href` and the raw route in `data-route`. The client decodes the route
  with `decodeURI` before matching so Japanese characters and spaces remain supported.
- Rewrite links equivalent to `.md`, `.adoc`, and `.html`, plus AsciiDoc xrefs, to hash routes.
- Rewrite a cross-file heading link such as `file.md#heading` to the target page's prefixed element ID
  (`{page-id}-heading`), so it lands on the heading in HTML and PDF alike. When the target has no such anchor,
  fall back to the top of that page and emit a warning. Same-page anchors remain supported.

Document supported, unsupported, and intentionally constrained syntax in [syntax.md](syntax.md), and update it
whenever syntax support changes.

## Mermaid

Mermaid supports `client` and `pre-render` modes.

- `client` injects the Mermaid runtime. `mermaid.runtime` selects a CDN reference or an inline bundle; inline is
  self-contained but increases output size when a diagram is present.
- `pre-render` converts diagrams to SVG during the build with
  [`pipeline/mermaidPrerender.ts`](../app/packages/core/src/pipeline/mermaidPrerender.ts) and Puppeteer with
  system Chromium.
- `processMermaidPrerender` inserts the SVG as a raw HAST node. Serialization must retain `allowDangerousHtml`
  so `viewBox`, `<defs>`, `url(#...)`, and `foreignObject` survive.

Preserve these pre-render invariants:

- SVG is inserted after source ID prefixing. Allocate globally unique, monotonically increasing, ASCII-safe IDs
  as `mermaid-{n}` across the whole build; do not derive them from `page.id`.
- Inject runtime JavaScript only when diagrams exist, Mermaid is enabled, and the mode is `client`.
- Missing Chromium, missing `puppeteer-core`, and browser startup failures are setup errors that fail the build.
  An individual diagram syntax error warns and replaces only that diagram with a source `<pre>`.
- Create the browser lazily and close it in `finally`. Do not start Chromium when there are no diagrams.
- Keep `validateSite` browserless by overriding Mermaid processing to client mode.
- The pre-rendered SVG theme is fixed at build time and does not follow the reader's theme toggle.

> [!IMPORTANT]
> Pre-render and PDF output require the npm-installed CLI. They are unavailable in the single-file bundle and
> the standalone executable because `puppeteer-core` remains external.

Browser startup and executable discovery are shared with PDF output through
[`pipeline/browser.ts`](../app/packages/core/src/pipeline/browser.ts). `PUPPETEER_EXECUTABLE_PATH` takes
precedence over automatic system-browser discovery.

## Client Theme

[`themes/default/`](../app/packages/core/src/themes/default/) contains `template.html`, `style.css`, and
`app.js`. `renderSingleHtml` replaces these template tokens:

```text
{{htmlAttrs}} {{bodyAttrs}} {{title}} {{style}} {{sidebar}} {{pages}}
{{siteDataJson}} {{appJs}} {{bodyScripts}}
{{contentWidthTogglePressed}} {{contentWidthToggleTitle}}
{{#contentWidthToggle}}...{{/contentWidthToggle}}
{{generatorVersion}}
{{#branding}}...{{/branding}} {{#generatorVersion}}...{{/generatorVersion}}
```

`window.__MONODOCS_DATA__` holds page information for routing, search, the table of contents, and previous/next
navigation. The client is a plain IIFE, and element access must remain null-guarded. Print CSS expands all
pages vertically.

Preserve these display and reachability invariants:

- **Sidebar**
  - `sidebar.collapseDepth` collapses directories but never removes their entries. Top-level directories have
    depth 1, `0` collapses all, and omission expands all.
  - Preserve the original letter case of directory names.
  - `sidebar.titleTransform.page` and `.directory` change display labels only, never routes, page IDs, or
    headings in page content.
  - `sidebar.titleFrom: "heading"` resolves explicit title, heading, then filename. `"filename"` skips the
    heading but never overrides an explicit frontmatter or `:sd-title:` title.
  - `sidebar.flattenSingleChild` flattens only a directory with exactly one page and no subdirectories. It is
    display-only and must not reduce reachability.
  - `sidebar.mode: "custom"` builds the sidebar from `sidebar.items` instead of the directory structure, and
    that order becomes the reading order (previous/next navigation, PDF page order, initially shown page). A
    path that does not resolve to a page is an error; an unlisted, `hidden`, or repeated page is a warning and
    never removes the page itself, which stays reachable by its route. Folder-derived
    `sidebar.titleTransform.directory` and `sidebar.flattenSingleChild` do not apply in this mode.
  - The sidebar title and its tool row (search, content width, dark mode) stay in place while only the
    navigation tree, or the search results that replace it, scrolls, so a tall tree never carries the search
    box out of sight. Reachability outranks this: on a viewport too short to hold the column, the whole sidebar
    scrolls again rather than clipping the tree to nothing.
  - At 768 px and below the sidebar is an overlay drawer that starts closed, so the document opens on its
    content. The drawer never makes the page scroll horizontally. On wider viewports the sidebar is permanent;
    clicks outside it and `Escape` must not close it. Opening a page from inside the drawer closes it, by
    pointer and keyboard alike, or the page stays hidden behind it. When the drawer closes, focus lands
    somewhere the reader can carry on from, never inside the hidden drawer or on the body.
- **Search shortcuts**: `/` and `Ctrl+K` / `⌘K` move focus to the search box from anywhere, opening the sidebar
  first when it is closed (otherwise the shortcut silently does nothing). No key may be taken from a reader who
  is typing or from an IME mid-composition, except `⌘K`, which carries no editing meaning; `Ctrl+K` does on
  macOS (delete to end of line).
- **Search clear button**: the theme's own, inside the search box, and the browser's × is not drawn beside it. It
  is shown only while the box holds a query, clears what `Escape` clears, and leaves the focus in the box and a
  narrow screen's drawer open. A template without it still searches; `app.js` guards its absence, and the rules
  hiding the browser's × apply only where the button is there (`.search-field.has-clear`, which `app.js` sets
  when it finds the button; a class rather than `:has()`, which Firefox gained only in 121), so such a template
  keeps that ×.
- `toc.maxLevel` filters embedded headings from h2 through the configured level (2-6, default 3). It does not
  remove content.
- `html.colorScheme` sets the initial light, dark, or automatic scheme. A stored `monodocs:theme` preference
  takes precedence.
- **Content width**: the toggle switches between the readable default maximum width and the full available
  width. The reader's choice is stored in `monodocs:content-width` and must not affect print or PDF layout.
  `html.contentWidthDefault` selects `standard` or `wide` until the reader makes a stored choice.
  `html.contentWidthToggle: false` omits the button and ignores any stored choice.
- **Image lightbox**: `html.imageLightbox` (on by default) opens unlinked, non-decorative content images in a
  keyboard-accessible dialog.
  - Images inside links or buttons keep the parent interaction; images with an explicit empty `alt` stay
    decorative. The dialog must not appear in print or PDF output.
  - Mermaid diagrams open in the same dialog once their SVG exists (at load for `pre-render`, after rendering
    for `client`). The SVG is moved into the dialog and back on close, not copied, because a copy would
    duplicate the IDs its styles and `url(#…)` references depend on.
  - The diagram block gets no button role, which would hide its text and description from assistive
    technology; a separate button that appears on keyboard focus opens it.
  - The dialog closes before printing and on route changes, so a diagram is never missing from the page.
- **Custom themes**: `html.theme` selects a built-in theme by name or a custom theme by directory path
  (resolved against the configuration file).
  - A custom theme may supply any subset of `template.html`, `style.css`, and `app.js`; the default theme
    supplies the rest, so restyling never requires vendoring the client script.
  - A template lacking `{{style}}`, `{{sidebar}}`, `{{pages}}`, `{{siteDataJson}}`, `{{appJs}}`, or
    `{{bodyScripts}}` must fail the build rather than produce a broken document.
  - Themes are read from the filesystem so every distribution form supports them, and must not reference
    external assets.
  - Rules a document asked for are appended by core to whatever stylesheet the theme supplies, never left to
    the theme: the page-break marker, figure placement (`figures.align` and AsciiDoc's `align=`),
    `pdf.pageBreakLevel`, `pdf.density`, and the `pdf.watermark` rule
    ([`pipeline/watermark.ts`](../app/packages/core/src/pipeline/watermark.ts)). A theme replacing `style.css`
    must not be able to delete "CONFIDENTIAL" from a document that asked for it. The watermark text reaches the
    CSS as an escaped string, the generated cover carries the same rule, and it is painted above the content
    with `mix-blend-mode: multiply`, because underneath, a theme's background covers it.
- **Print**: print and PDF have no scrollbars. Anything scrollable on screen (code blocks, tables) must wrap or
  fit in print, and a table crossing a page break repeats its header row. Content is never silently cut off at
  the page edge.
- **Messages and language**: everything monodocs prints (`--help` including Commander's generated headings,
  every error, every warning) goes through one catalogue, English by default and Japanese under `--lang ja` or
  `MONODOCS_LANG=ja`; the flag wins over the variable.
  - `LANG` and `LC_ALL` are deliberately not consulted, so a build log does not depend on the machine.
  - Core holds the current language rather than returning message keys, so callers read the sentence directly.
  - Messages reaching the user unwrapped from a dependency are out of scope, except the argument errors a
    reader actually hits (unknown option, unknown command, missing argument), which are intercepted and
    translated because the parser otherwise exits on its own.
  - A test fails when a new string is emitted outside the catalogue.
  - This is unrelated to the document's `lang`, which describes the pages, not the terminal.
- **Diagnostics**: every error and warning is a `Diagnostic` with a stable `code`, a severity, the translated
  `message`, and the source path and position wherever the pipeline knows them.
  - Message keys select wording; codes identify findings. They are separate, so translating or rewording a
    warning cannot change what a consumer pinned, and two messages may share one code.
  - Everything monodocs throws is a `MonodocsError` carrying its code, so an error caught at the top is
    reported as the finding it was; anything else reaching that boundary is reported as `internal/unexpected`.
  - A code is never renamed or given a different meaning once released.
- **Frozen surfaces**: every configuration key with its default, command, option, and diagnostic code is listed
  on the site's "What 1.0 Freezes" page in both languages, and `surfaces.test.ts` fails when the page and the
  code differ in either direction. Adding one means adding it there. The CLI's commands are defined in
  `cli/src/program.ts` (`createProgram`), apart from the entry point, so the test reads them without running
  the CLI.
- **PDF page numbers**: every body page carries its number and the total, centred at the foot.
  - The generated cover (`pdf.cover`) is rendered apart from the body with no bands, so it has no number, the
    body starts at 1, and the total counts the body only. Page labels make the viewer agree.
  - The band is an HTML fragment substituted through Chromium's own classes, not a monodocs template language,
    and holds only digits and a separator so it needs no translation.
  - Turning a band off must emit an explicitly empty fragment: `displayHeaderFooter` with nothing supplied
    falls back to Chromium's own date-and-title header.
  - A bottom margin too small for the default footer warns, with the threshold measured from that fragment. A
    replacement fragment is not judged, because whether arbitrary HTML fits cannot be told from the margin.
- **PDF metadata**: generated PDFs carry the document title and `monodocs v<version>` as Creator and Producer.
  The metadata pass runs after the bookmark pass, because pdf-lib rewrites Producer whenever it saves.
- **Branding**: `html.branding` shows a footer at the end of HTML and PDF output by default. The CLI supplies its
  package version at runtime; the renderer escapes it and omits only the version when none is available.
  `html.branding: false` omits the whole footer.

The default theme is deliberately neutral and not aligned with the [`site/`](../site/) design: the site
promotes monodocs, while the output represents whoever wrote the documents. Neutrality is also the better
starting point for `html.theme`, which replaces this directory. For the same reason, and because the single
file may not reference anything external (a webfont would have to be inlined into every artifact), the theme
embeds no webfont and uses system font stacks.
Treat the difference from the site as a decision, not as an inconsistency to be fixed.

Theme UI labels follow the document's `lang` (v0.10). Core is the source of truth: it resolves the table for
`lang`, applies `html.labels` over it, and publishes the result in `siteDataJson`. `app.js` consumes that rather
than holding its own copy, so a table and an override cannot drift apart; static labels come from tokens in
`template.html`. Tables ship for `en` and `ja`; a `lang` with no shipped table falls back to English labels
with a warning. Until v0.10 labels were always English, which left a `lang="ja"` document displaying
`On this page`; see [roadmap.md](roadmap.md) 23.4 for the reversal and what a custom theme is guaranteed.

> [!WARNING]
> TypeScript compilation does not copy `.html`, `.css`, or `.js` theme assets. The core build must run
> `packages/core/scripts/copy-theme.mjs` so `dist/themes` is usable. Rebuild after changing theme assets.

## Watch and Serve

[`watch.ts`](../app/packages/core/src/watch.ts) uses `fs.watch` (recursive where supported) with debouncing. It
watches source and configuration inputs, ignores output-file writes to prevent rebuild loops, and rejects a
missing input path. A single-file input is watched through its directory, filtered to that name, because
`fs.watch` follows the inode and would go silent after an editor saves by renaming a temporary file over the
original.

[`serve.ts`](../app/packages/core/src/serve.ts) provides HTTP serving, `watchSite`, and SSE live reload using
Node.js APIs. Keep it dependency-free unless a clear portability requirement justifies a new watching
dependency.

## Output Size

[`pipeline/outputSize.ts`](../app/packages/core/src/pipeline/outputSize.ts) reports each output after it is
written (roadmap 20.5).

- The total is read from disk, not summed while building.
- Each part of the HTML breakdown (every embedded image's data URI, the inline Mermaid runtime, the
  `siteDataJson` payload) is found in the final text, and `document` is the remainder, so the parts always sum
  to the file.
- `assets.budget` is checked against each output, HTML and PDF, as soon as it is measured, so an HTML over budget
  under `onBudget: error` fails before the PDF is rendered. The error carries the size report, because a failed
  build returns no result to print it from.
- `watch` (and `serve`, which runs on it) passes `onBudget: "warn"`.

## PDF

PDF generation expands the single HTML document in Chromium's print layout. Preserve these properties:

- All pages are expanded before printing, and client-mode Mermaid rendering is awaited.
- Inter-page hash routes are rewritten to page element destinations before printing.
- Bookmark destinations use ASCII surrogate IDs so Unicode page IDs remain reliable in PDF outlines.
- Images required by PDF output are embedded when possible, even if HTML image embedding is disabled.
- Browser setup failures fail fast and remain distinguishable from document-specific rendering failures.
- The printed table of contents (`pdf.toc`, [`pipeline/pdfToc.ts`](../app/packages/core/src/pipeline/pdfToc.ts))
  exists only in the PDF. It is injected before the font check, with an ASCII anchor (`mdtoc-{n}`) at each
  target, and its page numbers are read from the catalog `/Dests` of a print. Only a print whose destinations
  match the numbers it carries is returned; a document that does not settle within a bounded number of prints
  fails. The number column has a fixed width so filling it in cannot rewrap a line.

Since v0.10 the build measures what the document needs against what the machine can draw and reports the
difference (`fontCheck`, default `warn`), in the browser already open for PDF output and for Mermaid pre-render
alike. The latter bakes the build machine's fonts into the SVG, which is why the setting is top-level rather
than under `pdf`.

> [!IMPORTANT]
> PDF output uses system fonts. The development image includes Noto CJK and Noto Color Emoji; other environments
> must install fonts appropriate for their document content.

## Security Boundaries

`monodocs` converts trusted documents managed by the user or the user's team.

- Markdown raw HTML is discarded by the default remark-rehype path. The one exception is the page-break marker
  (`<div class="page-break"></div>` and its `style="page-break-after: always"` spelling, in the quoting and
  ASCII-whitespace variants the configuration reference enumerates), matched on the mdast `html` node before
  that path and replaced with an element core builds: a `div`, one class, no children. Nothing from the input
  reaches the output, so this is a recognised marker, not a hole in the boundary.
- AsciiDoc passthrough can emit raw HTML, which is embedded without sanitization. Converting untrusted AsciiDoc
  can therefore cause XSS.
- AsciiDoc `include::[]` runs in safe mode, which jails it under the input file's directory by **recovering**:
  `../` and absolute paths are pulled back inside the jail, not refused. Safe mode does not resolve symbolic
  links, so a link inside the tree pointing outside it is followed (as Asciidoctor documents). monodocs
  therefore registers an include processor:
  - It is consulted for every include about to be read, with the target already expanded, and refuses one
    whose real path lands outside the input root, naming the resolved path.
  - The path comes from `normalizeSystemPath`, the call Asciidoctor itself makes, so safe mode's recovery is
    followed rather than second-guessed.
  - A safe target is declined back to Asciidoctor, so `lines`, `tag`, and `tags` are untouched.
  - Another include processor registered in the same process could preempt this one or read elsewhere;
    monodocs registers no other ([roadmap.md](roadmap.md) 17.5).
- Images are embedded only when their resolved real paths, including symlink resolution, remain under the input
  root.
- `assets.onLargeImage` controls whether over-limit images are embedded with a warning, kept external, or
  treated as an error.

See [development.md](development.md) for the development environment and [testing.md](testing.md) for the test
strategy that protects these boundaries.

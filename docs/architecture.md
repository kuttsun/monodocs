# Architecture

[日本語](ja/architecture.md)

`monodocs` combines multiple Markdown and AsciiDoc sources into one self-contained HTML document and can
optionally render that document as PDF. It is a lightweight generator focused on single-file distribution,
not a replacement for Pandoc. See [roadmap.md](roadmap.md) for the specification and [status.md](status.md) for
implementation status.

## Source Renderer Architecture

Process each source format with its own renderer, normalize the result into the shared `Page` model, and only
then generate output. Do not route Markdown and AsciiDoc through a shared renderer. Shared types live in
[`app/packages/core/src/types.ts`](../app/packages/core/src/types.ts).

The central build function is `preparePages()` in
[`build.ts`](../app/packages/core/src/build.ts). It is shared by `buildSite` and `validateSite`:

```text
loadConfig (config.ts)
  -> scanSourceFiles (scan.ts)           scan inputs, detect formats, apply exclusions
  -> buildPages (pipeline/buildPages.ts) render with each SourceRenderer and normalize to Page[]
  -> postprocessPages (pipeline/postprocess.ts)
                                         rewrite links, embed images, transform Mermaid,
                                         and apply Shiki highlighting on HAST
  -> buildSidebar (pipeline/buildSidebar.ts)
                                         build the sidebar tree from the directory structure
  -> renderSingleHtml (pipeline/renderSingleHtml.ts)
                                         inject content into the template
  -> writeOutput (build.ts)
```

Format-specific renderers are
[`sources/markdown/renderer.ts`](../app/packages/core/src/sources/markdown/renderer.ts) and
[`sources/asciidoc/renderer.ts`](../app/packages/core/src/sources/asciidoc/renderer.ts). Both implement the
`SourceRenderer` interface (`extractMeta` and `render`). Metadata from frontmatter or `:sd-*:` attributes is
normalized into `PageMeta` by [`sources/meta.ts`](../app/packages/core/src/sources/meta.ts).

## Single-HTML Invariants

### IDs and anchors

Multiple source files share one HTML document, so every element ID must be globally unique.

- Prefix source-generated IDs with `{page-id}-`.
- Both renderers use `prefixIdsAndCollect` from
  [`sources/prefixIds.ts`](../app/packages/core/src/sources/prefixIds.ts) to prefix IDs, rewrite same-page
  anchors, and collect headings and searchable text.
- `buildPages` must reject both route collisions and page-ID collisions. For example, `a-b.md` and `a/b.md`
  produce the same page ID.
- Prefixing also applies to generated IDs such as footnotes, not only heading IDs.

### Routing and link rewriting

- Generate routes from relative paths without extensions and map `index` to `/`.
- Use hash routes such as `#/setup/install` for pseudo-page navigation.
- Store an `encodeURI`-encoded value in `href` and the raw route in `data-route`. The client decodes the route
  with `decodeURI` before matching so Japanese characters and spaces remain supported.
- Rewrite links equivalent to `.md`, `.adoc`, and `.html`, plus AsciiDoc xrefs, to hash routes.
- Rewrite a cross-file heading link such as `file.md#heading` to the target page's prefixed element ID
  (`{page-id}-heading`), so it lands on the heading in the HTML and in the PDF alike. When the target has no
  such anchor, fall back to the top of that page and emit a warning. Same-page anchors remain supported.

Document supported, unsupported, and intentionally constrained syntax in [syntax.md](syntax.md). Update it
whenever syntax support changes.

## Mermaid

Mermaid supports `client` and `pre-render` modes.

- `client` injects the Mermaid runtime into the HTML. `mermaid.runtime` selects a CDN reference or an inline
  bundle. Inline mode is self-contained but increases output size when a diagram is present.
- `pre-render` uses [`pipeline/mermaidPrerender.ts`](../app/packages/core/src/pipeline/mermaidPrerender.ts) and
  Puppeteer with system Chromium to convert diagrams to SVG during the build.
- `processMermaidPrerender` inserts pre-rendered SVG as a raw HAST node. Serialization must retain
  `allowDangerousHtml` so attributes and elements such as `viewBox`, `<defs>`, `url(#...)`, and
  `foreignObject` survive.

Preserve these pre-render invariants:

- Pre-rendered SVG is inserted after source ID prefixing. Allocate globally unique, monotonically increasing,
  ASCII-safe IDs as `mermaid-{n}` across the whole build. Do not derive them from `page.id`.
- Inject runtime JavaScript only when diagrams exist, Mermaid is enabled, and the mode is `client`.
- Treat missing Chromium, missing `puppeteer-core`, and browser startup failures as setup errors and fail the
  build. For an individual diagram syntax error, warn and replace only that diagram with a source `<pre>`.
- Create the browser lazily and close it in `finally`. Do not start Chromium when the input contains no diagrams.
- Keep `validateSite` browserless by overriding Mermaid processing to client mode.
- The pre-rendered SVG theme is fixed at build time and does not follow the reader's theme toggle.
- Pre-render and PDF output require the npm-installed CLI. They are unavailable in the single-file bundle or
  standalone executable because `puppeteer-core` remains external.

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

`window.__MONODOCS_DATA__` contains page information used by routing, search, the table of contents, and
previous/next navigation. The client is a plain IIFE, and element access must remain null-guarded. Print CSS
expands all pages vertically.

Preserve these display and reachability invariants:

- `sidebar.collapseDepth` collapses directories; it must not remove their entries. Top-level directories have
  depth 1, `0` collapses all directories, and omission expands all directories.
- `toc.maxLevel` filters embedded headings from h2 through the configured level (2-6, default 3). It does not
  remove content.
- Preserve the original letter case of directory names.
- Apply `sidebar.titleTransform.page` and `.directory` only to display labels. Never change routes, page IDs, or
  headings in page content.
- `sidebar.titleFrom: "heading"` resolves explicit title, heading, then filename. `"filename"` skips the heading
  but never overrides an explicit frontmatter or `:sd-title:` title.
- `sidebar.flattenSingleChild` flattens only a directory with exactly one page and no subdirectories. It is a
  display-only transformation and must not reduce reachability.
- `sidebar.mode: "custom"` builds the sidebar from `sidebar.items` instead of the directory structure, and the
  same order becomes the reading order (previous/next navigation, PDF page order, and the initially shown
  page). A path that does not resolve to a page is an error; an unlisted, `hidden`, or repeated page is a
  warning and never removes the page itself, which stays reachable by its route. Folder-derived
  `sidebar.titleTransform.directory` and `sidebar.flattenSingleChild` do not apply in this mode.
- `html.colorScheme` controls the initial light, dark, or automatic scheme. A reader's stored
  `monodocs:theme` preference takes precedence.
- The content-width toggle switches between the readable default maximum width and the full available width.
  A reader's choice is stored in `monodocs:content-width`; it must not affect print or PDF layout.
  `html.contentWidthDefault` selects `standard` or `wide` until the reader makes a stored choice.
  `html.contentWidthToggle: false` omits the button and ignores any stored reader choice.
- `html.imageLightbox` enables a keyboard-accessible dialog for unlinked, non-decorative content images by
  default.
  Images inside links or buttons retain the parent interaction, and the dialog must not appear in print or PDF
  output. Images with an explicit empty `alt` retain their decorative semantics.
- `html.theme` selects a built-in theme by name or a custom theme by directory path (resolved against the
  configuration file). A custom theme may supply any subset of `template.html`, `style.css`, and `app.js`;
  the default theme supplies the rest, so a theme never has to vendor the client script to restyle output.
  A template that lacks `{{style}}`, `{{sidebar}}`, `{{pages}}`, `{{siteDataJson}}`, `{{appJs}}`, or
  `{{bodyScripts}}` must fail the build rather than produce a broken document. Themes are read from the
  filesystem so that every distribution form supports them, and they must not reference external assets.
- Print and PDF have no scrollbars: anything the screen makes scrollable (code blocks, tables) must wrap or
  be laid out to fit in print, and a table crossing a page break repeats its header row. Content must never be
  silently cut off at the page edge.
- The sidebar title and its tool row — search, content width, dark mode — hold their place while only the
  navigation tree (or the search results that replace it) scrolls. A tree taller than the viewport must never
  carry the search box out of sight, because that is precisely when a reader reaches for it. Reachability
  outranks this: on a viewport too short to hold the column, the sidebar scrolls as a whole again rather than
  clipping the tree to nothing.
- `/` and `Ctrl+K` / `⌘K` move focus to the search box from anywhere in the document, opening the sidebar first
  when it is closed — a search box that cannot take focus makes the shortcut silently do nothing. No key may be
  taken from a reader who is typing, nor from an IME mid-composition. `⌘K` is the sole exception, because it
  carries no editing meaning; `Ctrl+K` does on macOS, where it deletes to the end of the line.
- Below 768 px the sidebar becomes an overlay drawer that starts closed, so the document opens on its content.
  The drawer never leaves the page scrolling horizontally, and on wider viewports the sidebar stays permanent —
  clicks outside it and `Escape` must not close it there. Opening a page from inside the drawer closes it, by
  pointer and by keyboard alike, or the page it opened stays hidden behind it. Whenever the drawer closes,
  focus lands somewhere the reader can carry on from, never inside the hidden drawer and never on the body.
- Everything monodocs prints — `--help` including the headings Commander generates, every error, and
  every warning — goes through one catalogue, English by default and Japanese under `--lang ja` or
  `MONODOCS_LANG=ja`, with the flag winning over the variable. `LANG` and `LC_ALL` are deliberately
  not consulted: a build log must not depend on the machine that produced it. Core holds the current
  language rather than returning message keys, so a caller reads the sentence rather than looking one
  up. A message that reaches the user unwrapped from a dependency is out of scope, except
  the argument errors a reader actually hits — unknown option, unknown command, missing argument —
  which are intercepted and translated; the parser exits on its own otherwise, so nothing downstream
  can reach them. A test fails when a new string is emitted outside the catalogue rather than
  leaving the gap to be found later. This is not the document's `lang`, which describes the pages rather than the terminal.
- Every error and warning monodocs reports is a `Diagnostic`: a stable `code`, a severity, the
  translated `message`, and the source path and position wherever the pipeline knows them. The
  message catalogue and the code set are separate identities — a message key selects wording, a code
  identifies a finding — so translating or rewording a warning cannot change what a consumer pinned,
  and two messages may share one code. Everything monodocs throws is a `MonodocsError` carrying its
  code, so an error caught at the top is reported as the finding it was; anything else reaching that
  boundary is reported as `internal/unexpected` rather than as a finding with no code at all. A code
  is never renamed or given a different meaning once released.
- Every PDF page carries its number and the total, centred at the foot. The band is an HTML fragment
  handed to Chromium and substituted through Chromium's own classes, not a monodocs template
  language, and it holds digits and a separator so the one thing added to every page needs no
  translation. Turning a band off must emit an explicitly empty fragment: `displayHeaderFooter` with
  nothing supplied falls back to Chromium's own date-and-title header, so omission produces the
  opposite of what was asked. A bottom margin too small for the default footer warns, with the
  threshold measured from that fragment rather than chosen; a replacement fragment is not judged,
  because whether arbitrary HTML fits cannot be told from the margin value.
- Generated PDFs carry the document title and `monodocs v<version>` as Creator and Producer. The metadata pass
  runs after the bookmark pass, because pdf-lib rewrites Producer whenever it saves.
- `html.branding` shows a footer at the end of HTML and PDF output by default.
  The CLI supplies its package version at runtime; the renderer escapes that value and omits only the version
  when no value is available. `html.branding: false` omits the complete footer.

The default theme is deliberately neutral, and it is not aligned with the design of the documentation site
under [`site/`](../site/). The two answer different briefs: the site argues that somebody should adopt monodocs
and carries an identity of its own for that purpose, while the output is a copy of somebody else's document.
Giving every generated file a vendor's palette and typography would stamp monodocs onto an artifact that
represents whoever wrote the documents, not the tool that bundled them. Neutrality is also the better starting
point for `html.theme`, which replaces this directory. For the same reason the theme embeds no webfont and uses
system font stacks: the single file may not reference anything external, so a face would have to be inlined
into every artifact, against the size the format exists for. Treat the difference from the site as a decision,
not as an inconsistency to be fixed.

Theme UI labels follow the document's `lang` (v0.10). Core is the source of truth: it resolves the table for
`lang`, applies `html.labels` over it, and publishes the result in `siteDataJson`. `app.js` consumes that
rather than holding its own copy of the strings, so a table and an override cannot drift apart; static labels
come from tokens in `template.html`. Tables ship for `en` and `ja`, and a `lang` with no shipped table falls
back to the English labels with a warning.

They were standardized in English and independent of the body language until v0.10. That described the
implementation more than it served the reader: it left a Japanese document declaring `lang="ja"` while
displaying `On this page`, which is the one combination that helps nobody, and no configuration could correct
either half. See [roadmap.md](roadmap.md) 23.4 for the reversal and for what a custom theme is guaranteed.

TypeScript compilation does not copy `.html`, `.css`, or `.js` theme assets. The core build must run
`packages/core/scripts/copy-theme.mjs` so `dist/themes` is usable after compilation. Rebuild after changing
theme assets.

## Watch and Serve

[`watch.ts`](../app/packages/core/src/watch.ts) uses `fs.watch`, recursive mode where supported, and debouncing.
It watches source and configuration inputs, ignores output-file writes to prevent rebuild loops, and rejects a
missing input path. A single-file input is watched through the directory that holds it, filtered to that one
name: `fs.watch` follows the inode, so watching the file itself would go silent after an editor saves by
writing a temporary file and renaming it over the original.

[`serve.ts`](../app/packages/core/src/serve.ts) provides HTTP serving, `watchSite`, and SSE live reload using
Node.js APIs. Keep the implementation dependency-free unless a clear portability requirement justifies a new
watching dependency.

## PDF

PDF generation expands the single HTML document in Chromium's print layout. Preserve the following properties:

- All pages are expanded before printing, and client-mode Mermaid rendering is awaited.
- Inter-page hash routes are rewritten to page element destinations before printing.
- Bookmark destinations use ASCII surrogate IDs so Unicode page IDs remain reliable in PDF outlines.
- Images required by PDF output are embedded when possible, even if normal HTML image embedding is disabled.
- Browser setup failures fail fast and remain distinguishable from document-specific rendering failures.

PDF output uses system fonts. The development image includes Noto CJK and Noto Color Emoji; other runtime
environments must install fonts appropriate for their document content. Since v0.10 the build measures what
the document needs against what the machine can draw and reports the difference (`fontCheck`, default `warn`),
in the browser already open for PDF output and for Mermaid pre-render alike — the latter bakes the build
machine's fonts into the SVG, which is why the setting is not part of `pdf`.

## Security Boundaries

`monodocs` converts trusted documents managed by the user's team.

- Markdown raw HTML is discarded by the default remark-rehype path. The one exception is the
  page-break marker (`<div class="page-break"></div>` and the `style="page-break-after: always"`
  spelling of it, in the quoting and ASCII-whitespace variants the configuration reference
  enumerates), matched on the mdast `html` node before that path and replaced with an element core
  builds — a `div`, one class, no children. Nothing from the input reaches the output, so this is a
  recognised marker rather than a hole in the boundary.
- AsciiDoc passthrough can emit raw HTML, which is embedded without sanitization. Converting untrusted AsciiDoc
  can therefore cause XSS.
- AsciiDoc `include::[]` runs in safe mode and is jailed under the input file's directory.
- Images are embedded only when their resolved real paths, including symlink resolution, remain under the input
  root.
- `assets.onLargeImage` controls whether over-limit images are embedded with a warning, kept external, or treated
  as an error.

See [development.md](development.md) for the development environment and [testing.md](testing.md) for the test
strategy that protects these boundaries.

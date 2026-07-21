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
- Cross-file heading links such as `file.md#heading` currently resolve only to the target page. Drop the anchor
  and emit a warning. Same-page anchors remain supported.

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
{{htmlAttrs}} {{title}} {{style}} {{sidebar}} {{pages}}
{{siteDataJson}} {{appJs}} {{bodyScripts}}
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
- `html.colorScheme` controls the initial light, dark, or automatic scheme. A reader's stored
  `monodocs:theme` preference takes precedence.

Theme UI labels are standardized in English and are independent of document body language. Dynamic labels are
centralized in `LABELS` in `app.js`; static labels live in `template.html`.

TypeScript compilation does not copy `.html`, `.css`, or `.js` theme assets. The core build must run
`packages/core/scripts/copy-theme.mjs` so `dist/themes` is usable after compilation. Rebuild after changing
theme assets.

## Watch and Serve

[`watch.ts`](../app/packages/core/src/watch.ts) uses `fs.watch`, recursive mode where supported, and debouncing.
It watches source and configuration inputs, ignores output-file writes to prevent rebuild loops, and rejects a
missing input directory.

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
environments must install fonts appropriate for their document content.

## Security Boundaries

`monodocs` converts trusted documents managed by the user's team.

- Markdown raw HTML is discarded by the default remark-rehype path.
- AsciiDoc passthrough can emit raw HTML, which is embedded without sanitization. Converting untrusted AsciiDoc
  can therefore cause XSS.
- AsciiDoc `include::[]` runs in safe mode and is jailed under the input file's directory.
- Images are embedded only when their resolved real paths, including symlink resolution, remain under the input
  root.
- `assets.onLargeImage` controls whether over-limit images are embedded with a warning, kept external, or treated
  as an error.

See [development.md](development.md) for the development environment and [testing.md](testing.md) for the test
strategy that protects these boundaries.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language policy

The repository-wide language policy is defined in [AGENTS.md](AGENTS.md). Read and follow it before modifying
repository artifacts or choosing the conversation language. In particular, keep AI-facing repository
documentation in English while communicating with each user in their preferred language.

## What this is

`monodocs` is a CLI tool that combines multiple Markdown and AsciiDoc files into a **single self-contained
HTML document** (and now PDF). Source documents remain split for maintenance, while the distributable output
is a single file. It is not intended to replace Pandoc; it is a lightweight generator focused on single-file
distribution. See [docs/roadmap.md](docs/roadmap.md) for the specification and roadmap, and
[docs/status.md](docs/status.md) for implementation status.

## Development environment and commands

**Do not pollute the host environment.** Do not install Node.js or pnpm globally on the host. Run development,
build, and test commands in the dedicated `monodocs-dev` Docker image (`Dockerfile.dev`, with pnpm installed).
All application code is under `app/`, which is a pnpm monorepo.

Run commands from the host through `scripts/app.sh`. It builds the image automatically when missing, mounts
the working tree, and runs commands from `app/`:

```bash
scripts/app.sh pnpm install      # Install dependencies
scripts/app.sh pnpm build        # Build all packages with tsc and copy theme assets to dist
scripts/app.sh pnpm test         # Run all tests with vitest
scripts/app.sh pnpm typecheck    # Run tsc --noEmit in every package
scripts/app.sh pnpm format       # Format with Prettier
scripts/app.sh pnpm format:check # Check formatting with Prettier
```

Run an individual test:

```bash
scripts/app.sh pnpm exec vitest run packages/core/src/route.test.ts
scripts/app.sh pnpm exec vitest run -t "rewrites links"
```

Try the CLI locally after building. Use `--host 0.0.0.0` to access the server from the host browser:

```bash
scripts/app.sh node packages/cli/dist/index.js build ../examples/ja -o dist/manual.html
scripts/app.sh node packages/cli/dist/index.js serve ../examples/ja --host 0.0.0.0  # http://localhost:4173/
```

Notes:

- Use `scripts/app.sh` **from the host**. Inside a devcontainer or container shell, run `pnpm ...` directly;
  otherwise, `scripts/app.sh` attempts Docker-in-Docker.
- When using a plain Node image instead of the dedicated image, Corepack downloads pnpm on demand.
  `monodocs-dev` avoids that. Keep `packageManager` in `app/package.json` aligned with `PNPM_VERSION` in
  `Dockerfile.dev`.
- Commands such as `node node_modules/.bin/tsc` fail because the file is a shell wrapper. If direct execution
  is necessary, use `node node_modules/typescript/bin/tsc ...` or `./node_modules/.bin/vitest ...`; normally,
  use pnpm.

## Architecture (Source Renderer Architecture)

The core principle is: **process each source format with its own renderer, normalize it into the shared `Page`
model, and only then generate output** (see section 11 of [docs/roadmap.md](docs/roadmap.md)). Do not try to
process Markdown and AsciiDoc through the same renderer. Shared types live in
[app/packages/core/src/types.ts](app/packages/core/src/types.ts).

The central build function is `preparePages()` in [build.ts](app/packages/core/src/build.ts), shared by
`buildSite` and `validateSite`. Data flow:

```text
loadConfig (config.ts)
  -> scanSourceFiles (scan.ts)           scan inputs, detect formats by extension, apply exclusions
  -> buildPages (pipeline/buildPages.ts) render with each SourceRenderer and normalize to Page[]
  -> postprocessPages (pipeline/postprocess.ts) rewrite links, embed images as data URIs,
                                           transform Mermaid, and apply Shiki highlighting on HAST
  -> buildSidebar (pipeline/buildSidebar.ts) build the sidebar tree from the directory structure
  -> renderSingleHtml (pipeline/renderSingleHtml.ts) inject content into the template
  -> writeOutput (build.ts)
```

Format-specific renderers are [sources/markdown/renderer.ts](app/packages/core/src/sources/markdown/renderer.ts)
(unified/remark/rehype) and
[sources/asciidoc/renderer.ts](app/packages/core/src/sources/asciidoc/renderer.ts) (Asciidoctor.js). Both
implement the shared `SourceRenderer` interface (`extractMeta` / `render`). Metadata normalization
(frontmatter or `:sd-*:` to `PageMeta`) is in [sources/meta.ts](app/packages/core/src/sources/meta.ts).

### Critical invariants for single-HTML output

- **Prevent heading ID collisions**: Because multiple files are placed in one HTML document, prefix every
  element ID with `{page-id}-`. Markdown uses the `collectHeadingsAndText` rehype plugin in its renderer;
  AsciiDoc applies the same prefix and rewrites xrefs and anchors within the same document. `buildPages` must
  detect and reject page ID collisions as well as route collisions. For example, `a-b.md` and `a/b.md` produce
  the same page ID.
- **Routing**: Generate routes from relative paths without extensions, with `index` mapped to `/`. Use hash
  routes such as `#/setup/install` for pseudo-page navigation within the single HTML document. Store an
  `encodeURI`-encoded value in `href` and the raw route in `data-route`; the client decodes it with `decodeURI`
  before matching, supporting Japanese characters and spaces. See
  [themes/default/app.js](app/packages/core/src/themes/default/app.js).
- **Link rewriting**: Rewrite links equivalent to `.md`, `.adoc`, and `.html`, plus AsciiDoc xrefs, to hash
  routes. Heading links such as `file.md#heading` currently resolve only to the file; drop the anchor and emit
  a warning.
- **Shared ID prefixing**: Both renderers use `prefixIdsAndCollect` from
  [sources/prefixIds.ts](app/packages/core/src/sources/prefixIds.ts) to prefix every element ID, rewrite
  same-document anchors, and collect headings and text. This also prevents collisions in generated IDs such as
  footnotes.

Document supported syntax and syntax that is unsupported or intentionally constrained by single-HTML output
in [docs/syntax.md](docs/syntax.md). Update that document whenever syntax support changes.

### Mermaid (`mermaid.mode`: client / pre-render)

Mermaid supports two rendering modes. **client** (the default) includes the Mermaid runtime in the HTML and
renders diagrams in the browser. `mermaid.runtime` selects `cdn` for a CDN reference or `inline` for an embedded
bundle; see [themes/mermaid.ts](app/packages/core/src/themes/mermaid.ts). Inline mode is self-contained but adds
about 975 KB gzip whenever at least one diagram exists. **pre-render** uses
[pipeline/mermaidPrerender.ts](app/packages/core/src/pipeline/mermaidPrerender.ts) with Puppeteer
(`puppeteer-core`, system Chromium, an optional dependency loaded dynamically) to convert every diagram to SVG
during the build. `processMermaidPrerender` in
[postprocess.ts](app/packages/core/src/pipeline/postprocess.ts) inserts SVG as a **raw HAST node**. The serializer
uses `allowDangerousHtml` so that `viewBox`, `<defs>`, `url(#...)`, and `foreignObject` survive without passing
through an HTML parser.

- **ID allocation**: Pre-rendered SVG is inserted after `prefixIdsAndCollect` and therefore does not receive
  page prefixes. Allocate globally unique, monotonically increasing, ASCII-safe IDs in the form `mermaid-{n}`
  across the build to prevent collisions in `url(#...)` and `<style> #id{}`. Do not use `page.id`, which may
  contain Unicode or begin with a digit.
- **Runtime injection gate**: Pre-rendered SVG is static, so do not inject runtime JavaScript. In
  [build.ts](app/packages/core/src/build.ts), `bodyScripts` is included only when
  `hasMermaid && enabled && mode === "client"`.
- **Distinguish errors and fail fast**: Treat environment or setup failures, such as missing Chromium,
  missing `puppeteer-core`, or browser startup failure, as `MermaidPrerenderSetupError`. `processMermaidPrerender`
  must rethrow these errors and stop the build rather than hiding them behind per-diagram fallback. For
  diagram-specific render failures such as syntax errors, warn and replace the affected block with
  `<pre class="mermaid">` showing the source. `createPuppeteerPrerenderer` throws setup failures using this type.
- **Renderer lifecycle**: In pre-render mode, `buildSite` creates a lazy renderer, passes it to `preparePages`,
  and closes it in `finally`. Chromium must not start when there are no diagrams. `validateSite` overrides
  `mermaidMode` to `client`, keeping validation browserless; actual pre-rendering and its syntax errors are not
  covered by validation. If a build requests pre-render mode without an injected renderer, fail rather than
  swallowing the error.
- **Limitations**: The SVG theme is fixed at build time and does not follow the reader's dark/light toggle;
  `colorScheme: auto` behaves like light mode. Pre-rendering is unavailable in the bundled CLI (single `.cjs`
  or standalone executable), because it has no `node_modules` from which to resolve `puppeteer-core`.
  `bundle.mjs` marks it as external, and the dynamic-import failure provides guidance at runtime. Specify
  Chromium through `PUPPETEER_EXECUTABLE_PATH`; it is included in `Dockerfile.dev`.

### Client theme

[themes/default/](app/packages/core/src/themes/default/) contains `template.html`, `style.css`, and `app.js`.
`renderSingleHtml` replaces the tokens `{{htmlAttrs}}`, `{{title}}`, `{{style}}`, `{{sidebar}}`, `{{pages}}`,
`{{siteDataJson}}`, `{{appJs}}`, and `{{bodyScripts}}`. `window.__MONODOCS_DATA__` contains page data for search,
the table of contents, and previous/next navigation: route, title, hidden flag, headings, and body text. `app.js`
implements search, table of contents, previous/next navigation, dark mode, sidebar collapsing, and hash routing
as a plain IIFE whose element access is always null-guarded. Print CSS expands every page vertically.

- **Sidebar collapse depth (`sidebar.collapseDepth`)**: `renderSidebar` in `renderSingleHtml` adds the `collapsed`
  class server-side to directories deeper than this value. Top-level directories have depth 1; `0` collapses
  all directories, and an omitted value expands all. This must **collapse, not hide**, so every deep page remains
  reachable through client-side toggles. Do not implement depth limits by removing navigation entries.
- **Table-of-contents depth (`toc.maxLevel`)**: Filter headings embedded in `__MONODOCS_DATA__` to h2 through
  `maxLevel`, where the allowed range is 2-6 and the default is 3. These headings are anchors within an already
  reachable page, so reducing the depth does not remove content. CSS indentation exists for `toc-level-4` through
  `toc-level-6`.
- **Directory name display**: Preserve the original letter case in sidebar directory names. Do not restore
  `text-transform: uppercase` on `.sidebar-dir-title`.
- **Display title transformation (`sidebar.titleTransform`)**: Apply transformations only to display titles
  that are not explicit frontmatter `title` or `:sd-title:` values. `page` applies to heading- or filename-based
  page titles chosen with `titleFrom: "heading"`; `directory` applies to directory names. Each transformation is
  `{ type: "none" }` by default, `{ type: "stripNumberPrefix" }` to remove leading numeric prefixes such as
  `01_setup` or `001-intro`, or `{ type: "regex", pattern, replacement, flags }` for JavaScript `RegExp`
  replacement. Routes, page IDs, and headings in page content must not change.
- **Page title source (`sidebar.titleFrom`)**: `"heading"` (default) uses explicit title, then Markdown H1 or
  AsciiDoc `= Title`, then filename. `"filename"` skips headings and uses the filename unless an explicit title
  exists. Explicit frontmatter `title` and `:sd-title:` always take precedence. `extractMeta` and `toPageMeta`
  keep explicit `PageMeta.title` separate from `PageMeta.headingTitle`; `resolveTitle` in `buildPages` selects
  according to `titleFrom`. Do not warn about a missing title in `"filename"` mode because the filename is the
  requested source. Routes and page IDs must not change.
- **Flatten single-page directories (`sidebar.flattenSingleChild`)**: When `true` (default `false`), flatten a
  directory with **exactly one page and no subdirectories**, promoting that page to its parent. This handles
  folders containing one document plus related images; images do not count as pages. `flattenSingleChildDirs`
  in [buildSidebar.ts](app/packages/core/src/pipeline/buildSidebar.ts) applies this recursively bottom-up after
  building the tree, so a chain such as `a/b/single.md` also flattens. Do not flatten directories with multiple
  pages or directories whose only child is a structured subdirectory with multiple pages. Routes and page IDs
  remain unchanged; this affects only display structure and must not reduce reachability.
- **Initial color scheme (`html.colorScheme`)**: Sets the initial theme to `"light"` (default), `"dark"`, or
  `"auto"` (follow `prefers-color-scheme`). It is separate from `html.theme`, which selects the template.
  `renderSingleHtml` emits `data-theme` on `<html>` server-side for `light` and `dark`, resolving the theme before
  CSS evaluation and avoiding FOUC or failure when JavaScript is disabled. For `auto`, omit the attribute and
  follow the OS. Also embed the value in `__MONODOCS_DATA__.colorScheme`. `setupTheme` in `app.js` gives the
  reader's `localStorage` value `monodocs:theme` highest priority, otherwise applying this initial value. Once
  the reader toggles the theme, the stored value takes precedence on later visits.

> **Theme assets must be copied to `dist`**: `tsc` does not copy `.html`, `.css`, or `.js`. The build runs
> `packages/core/scripts/copy-theme.mjs` to copy `src/themes` to `dist/themes`. `loadTheme` reads from
> `src/themes` under Vitest and `dist/themes` after building. Rebuild after editing theme assets.

### watch / serve

[watch.ts](app/packages/core/src/watch.ts) uses `fs.watch` with recursive mode where available and debouncing to
watch inputs and configuration, then rebuilds. It ignores write events for output files to prevent rebuild loops
and throws when the input directory does not exist. [serve.ts](app/packages/core/src/serve.ts) provides HTTP
serving, `watchSite`, and SSE live reload. It uses only Node APIs rather than adding chokidar or similar dependencies.

## Test policy

Use Vitest. Tests include unit tests for routing, format detection, renderers, and sidebar generation; end-to-end
tests that call `buildSite()` on temporary source trees and inspect the generated single HTML; and **client tests**
that run `app.js` under `@vitest-environment happy-dom` with `new Function(theme.appJs)()` to exercise hash
routing, search, the table of contents, dark mode, and related behavior. See
[themes/default/app.v04.test.ts](app/packages/core/src/themes/default/app.v04.test.ts) and
[docs/testing.md](docs/testing.md).

## Input trust and security

Only convert **trusted documents managed by the user's team**. Markdown raw HTML is discarded by the default
remark-rehype behavior. AsciiDoc, however, can emit raw HTML through passthrough, and monodocs embeds it without
sanitization, so untrusted AsciiDoc can cause XSS. AsciiDoc `include::[]` runs in safe mode and is jailed under
the input file's directory. Images are embedded as data URIs only when their resolved real paths, including
symlink resolution, remain under the input root. See [docs/development.md](docs/development.md).

## Workflow

Add features by roadmap version: v0.1 for Markdown single HTML; v0.2 for AsciiDoc and mixed input; v0.3 for links,
images, Mermaid, and validation; v0.4 for search, table of contents, watch, and serve; v0.5 for PDF; and later
versions as defined in the roadmap. At each version boundary, update [docs/status.md](docs/status.md) and
[docs/testing.md](docs/testing.md). Commit messages use a Conventional Commits prefix, an English description,
and the target version at the end, for example `feat: add search indexing (v0.4)`.

## Review (required)

After an implementation is complete and typecheck, tests, and formatting pass, request a code review from the
`codex` CLI and address the findings. This is a repository workflow requirement.

```bash
codex review --uncommitted          # Review staged, unstaged, and untracked changes before a commit
codex review --commit <SHA>         # Review a specific commit
```

`--uncommitted` cannot be combined with a custom prompt. Resolve P1 and P2 findings by default and report how
they were addressed.

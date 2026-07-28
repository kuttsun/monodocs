# Configuration

monodocs reads an optional `monodocs.config.yml` to control how your files are bundled into a single HTML. Without a config file the defaults below are used, so a config file is only needed when you want to override them.

## Where the config file lives

monodocs resolves the config file in this order:

1. The path passed to `-c, --config <file>`.
2. `monodocs.config.yml` **inside the input directory** (when you pass an input argument, e.g. `monodocs build ./docs`).
3. `monodocs.config.yml` in the **current working directory** (when no input argument is given).

If you pass `--config` explicitly and the file does not exist, the build fails. Relative paths inside the config (`input`, `output.path`) are resolved **relative to the config file's location**, not the current directory.

```bash
# Auto-detect ./docs/monodocs.config.yml
monodocs build ./docs

# Use an explicit config file
monodocs build -c ./monodocs.config.yml
```

## Precedence

Settings are merged in this order, highest first:

**CLI options** › **config file** › **defaults**

So `-o`, `--config`, and `-f` on the command line always win over the config file. Only `output.path`/`-o`, `output.format`/`-f`, and `input`/`<input arg>` are also settable on the CLI; everything else is config-file only.

## Full example

Every key is optional. This example lists them all with their default values:

```yaml
# Document title shown in the output HTML
title: Documentation

# Input directory (overridden by the CLI input argument)
input: ./docs

output:
  format: html # html | pdf | both
  path: ./dist/manual.html

sources:
  markdown:
    extensions: [.md, .markdown]
  asciidoc:
    extensions: [.adoc, .asciidoc, .asc]

sidebar:
  # "folder" (default) builds the sidebar from the directory structure; "custom" uses the items below
  mode: folder
  # Sidebar definition for mode: custom (each entry has either path or children)
  # items:
  #   - title: Home
  #     path: index.md
  #   - title: Setup
  #     children:
  #       - path: setup/install.adoc
  # Glob patterns excluded from scanning (partials/includes, files starting with _)
  exclude: ['_partials/**', 'partials/**', 'includes/**', '**/_*']
  # Collapse directories deeper than this level by default. Unset by default = all expanded; 0 = collapse all
  # collapseDepth: 2
  # Take the navigation title from "heading" (default) or "filename"
  titleFrom: heading
  # Pull a single-page folder's only page up to its parent
  flattenSingleChild: false
  # Transform derived display titles (never the explicit frontmatter / :sd-title: title)
  titleTransform:
    page: { type: none } # none | stripNumberPrefix | regex
    directory: { type: none }

toc:
  # Deepest heading level shown in the in-page table of contents (2–6)
  maxLevel: 3

assets:
  embedImages: true
  maxInlineSize: 5MB # "500KB", "5MB", or a raw byte count
  onLargeImage: warn # warn | error | external

mermaid:
  enabled: true
  mode: client # client | pre-render
  runtime: inline # inline | cdn (client mode only)

highlight:
  enabled: true

html:
  theme: default
  colorScheme: light # light | dark | auto (follows the OS setting)
  contentWidth: 860px # a CSS length, or "full" for the full available width
  contentWidthToggle: true # show the standard/wide toggle
  contentWidthDefault: standard # standard | wide (used until the reader chooses)
  imageLightbox: true # click unlinked, non-decorative content images to enlarge them
```

## Reference

### Top level {#top-level}

| Key      | Type   | Default           | Description                                                                                    |
| -------- | ------ | ----------------- | ---------------------------------------------------------------------------------------------- |
| `title`  | string | `Documentation`   | Title shown in the output HTML (`<title>` and header).                                          |
| `input`  | string | `./docs`          | Input directory to scan. The CLI input argument overrides this. Relative to the config file.   |

### `output`

| Key             | Type                  | Default               | Description                                                  |
| --------------- | --------------------- | --------------------- | ------------------------------------------------------------ |
| `output.format` | `html` `pdf` `both`   | `html`                | Output format. Overridden by `-f, --format`.                 |
| `output.path`   | string                | `./dist/manual.html`  | Output file path. Overridden by `-o, --output`. Relative to the config file. |

### `sources`

Controls which file extensions are treated as Markdown vs. AsciiDoc.

| Key                            | Type       | Default                       |
| ------------------------------ | ---------- | ----------------------------- |
| `sources.markdown.extensions`  | string[]   | `[.md, .markdown]`            |
| `sources.asciidoc.extensions`  | string[]   | `[.adoc, .asciidoc, .asc]`    |

### `sidebar`

Unknown keys under `sidebar` are rejected (this section is validated strictly).

| Key                          | Type      | Default                                            | Description |
| ---------------------------- | --------- | -------------------------------------------------- | ----------- |
| `sidebar.mode`               | `folder` `custom` | `folder`                                   | How the sidebar is built. `folder` derives it from the directory structure. `custom` uses `sidebar.items` exactly as written. See below. |
| `sidebar.items`             | object[]  | unset                                              | The sidebar definition for `mode: custom`. Requires `mode: custom`, and `mode: custom` requires it. See below. |
| `sidebar.exclude`            | string[]  | `['_partials/**', 'partials/**', 'includes/**', '**/_*']` | Glob patterns excluded from scanning. Files starting with `_` are treated as include/partial files regardless of extension. |
| `sidebar.collapseDepth`      | integer   | unset                                              | Collapse directories **deeper** than this level by default (top level = depth 1). `0` collapses everything, unset keeps all expanded. Pages stay reachable — collapsing hides nothing, it can always be re-opened. |
| `sidebar.titleFrom`          | `heading` `filename` | `heading`                               | Where the navigation title comes from. `heading` = explicit title → heading → filename. `filename` = skip the heading and use the filename (the explicit frontmatter / `:sd-title:` title always wins either way). |
| `sidebar.flattenSingleChild` | boolean   | `false`                                            | Flatten a directory that holds **exactly one page and no subfolders**, pulling that page up to its parent. Useful when each document lives in its own folder with its images (images are not counted as pages). |
| `sidebar.titleTransform`     | object    | `{ page: none, directory: none }`                  | Transform **derived** display titles (heading- or filename-based page titles, and directory names). The explicit frontmatter / `:sd-title:` title is never transformed, and routes / page IDs never change. See below. |

#### `sidebar.items` (custom sidebar)

With `sidebar.mode: custom` you write the sidebar yourself, and the structure, order, and titles are
used exactly as written:

```yaml
sidebar:
  mode: custom
  items:
    - title: Home
      path: index.md
    - title: Setup
      children:
        - path: setup/install.adoc
        - title: Configuration # overrides the page title
          path: setup/config.md
```

Each entry has either `path` (a page) or `children` (a group), never both:

- `path` is the file path relative to `input`, extension included (`setup/install.adoc`). `./` and `\` are accepted.
- `title` is optional for a page — the page's own title is used when omitted — and required for a group.

The custom sidebar also defines the **reading order**: previous/next navigation, the order of pages in a
PDF, and the initially shown page all follow it. Pages you do not list stay reachable by their hash route
and are reported as a warning by `monodocs validate`; they are placed after the listed pages in reading
order. A `hidden` page listed here is skipped with a warning, and a group whose pages all disappear is
dropped. A path that does not exist is an error.

Because the structure and titles are explicit, `sidebar.titleTransform.directory` and
`sidebar.flattenSingleChild` do not apply in this mode. `sidebar.collapseDepth`, `sidebar.exclude`,
`sidebar.titleFrom`, and `sidebar.titleTransform.page` still work as usual.

#### `sidebar.titleTransform`

Both `page` and `directory` accept one of three transform types:

- `{ type: none }` — no transformation (default).
- `{ type: stripNumberPrefix }` — strip a leading numeric prefix such as `01_setup` or `001-intro`.
- `{ type: regex, pattern, replacement, flags }` — regex replacement. `flags` is optional (`g`, `i`, `u`, … as in JavaScript `RegExp`).

```yaml
sidebar:
  titleTransform:
    page: { type: stripNumberPrefix }
    directory:
      type: regex
      pattern: '-'
      replacement: ' '
      flags: g
```

### `toc`

| Key            | Type    | Default | Description                                                                                  |
| -------------- | ------- | ------- | -------------------------------------------------------------------------------------------- |
| `toc.maxLevel` | integer | `3`     | Deepest heading level (2–6) shown in the in-page table of contents. `h1` is always excluded (it is the page title). Headings only affect the TOC, never reachability — the body always shows them. |

### `assets`

| Key                    | Type            | Default | Description                                                                              |
| ---------------------- | --------------- | ------- | ---------------------------------------------------------------------------------------- |
| `assets.embedImages`   | boolean         | `true`  | Embed local images as data URIs so the output stays self-contained.                       |
| `assets.maxInlineSize` | string / number | `5MB`   | Maximum size for an embedded image. Accepts `B` / `KB` / `MB` / `GB` suffixes or a byte count. |
| `assets.onLargeImage`  | `warn` `error` `external` | `warn` | What to do when an image exceeds `maxInlineSize`: warn and embed anyway, fail the build, or keep an external reference. |

### `mermaid`

| Key               | Type                  | Default  | Description                                                              |
| ----------------- | --------------------- | -------- | ------------------------------------------------------------------------ |
| `mermaid.enabled` | boolean               | `true`   | Render Mermaid code blocks as diagrams.                                   |
| `mermaid.mode`    | `client` `pre-render` | `client` | `client` runs the mermaid runtime in the browser (see `runtime`). `pre-render` rasterizes each diagram to inline SVG at build time via headless Chromium (no JS, print-stable, smaller than `inline` for a handful of diagrams). |
| `mermaid.runtime` | `inline` `cdn`        | `inline` | **client mode only.** `inline` (default) embeds the mermaid runtime in the HTML for a **fully self-contained, offline** file (adds ~975KB gzip when diagrams exist). `cdn` loads it from a CDN, keeping the HTML tiny but **requiring network access to display**. |

#### `client` vs `pre-render`

Both render with the same mermaid engine, so a given diagram's shape and layout are essentially identical. The differences are:

| Aspect                  | `client` (cdn / inline)                  | `pre-render`                                   |
| ----------------------- | ---------------------------------------- | ---------------------------------------------- |
| Self-contained          | cdn = needs network / inline = yes       | Yes (SVG embedded)                             |
| JavaScript              | Required                                 | Not required                                   |
| Added size              | cdn ≈ 0 / inline ≈ 975KB(gzip) fixed     | Proportional to diagram count (a few KB each)  |
| Dark theme              | Does not follow it (mermaid default)     | Fixed via `html.colorScheme` (`dark`→dark, else light) |
| Fonts                   | Reader's browser fonts                   | **Measured & baked with the build machine's fonts** |
| Interactivity (`click`) | Works                                    | Disabled (static SVG)                          |
| Print / unvisited pages | May be missing                           | Always rendered                                |

> **Fonts caveat**: `pre-render` measures and positions text using the fonts of **the machine running the build**, then bakes the result into the SVG. Diagrams with non-Latin labels (e.g. Japanese) render as boxes or wrap incorrectly if the build environment lacks the needed font (e.g. Noto CJK). `client` uses the reader's fonts, so it is not affected. Note that when installed via npm, what matters is **your build environment's fonts** — monodocs cannot supply them.

> **Default is `client`**: `pre-render` needs Chromium at build time and the build fails if it is missing (environment errors fail fast; only per-diagram syntax errors warn and fall back to source). To avoid forcing this dependency on everyone, the default is `client`. Point at a local Chromium with `PUPPETEER_EXECUTABLE_PATH` (bundled in the dev Docker image). `pre-render` is unavailable in the bundled CLI (single `.cjs` / single-executable), which ships without `node_modules`; use a package install instead.

### `highlight`

| Key                 | Type    | Default | Description                                  |
| ------------------- | ------- | ------- | -------------------------------------------- |
| `highlight.enabled` | boolean | `true`  | Syntax-highlight code blocks (via shiki).    |

### `html`

| Key                  | Type            | Default     | Description                                                                          |
| -------------------- | --------------- | ----------- | ------------------------------------------------------------------------------------ |
| `html.theme`         | string          | `default`   | Built-in theme name (`default`) or a path to a custom theme directory (`./my-theme`), resolved relative to the config file. See below. |
| `html.colorScheme`   | `light` `dark` `auto` | `light` | Initial color scheme when a document is opened. `auto` follows the OS `prefers-color-scheme`. Once a reader toggles it in the UI, the choice is saved in the browser and takes precedence (distinct from the `html.theme` template name). |
| `html.contentWidth`  | string / number | `860px`     | Max width of the content area. A CSS length (`px`, `rem`, `em`, `ch`, `vw`, `%`) or a number (px). `full` (or `none`) expands to the full available width. |
| `html.contentWidthToggle` | boolean | `true` | Show the reader-facing standard/wide content toggle. When `false`, stored reader choices and `html.contentWidthDefault` are ignored. |
| `html.contentWidthDefault` | `standard` `wide` | `standard` | Initial content-width state. A reader's saved choice takes precedence. |
| `html.imageLightbox` | boolean | `true` | Open unlinked, non-decorative content images in a viewport-sized dialog when clicked or activated from the keyboard. Linked images retain their original link behavior, and images with an explicit empty `alt` remain decorative. The dialog is omitted from print and PDF output. |

#### `html.theme` (custom theme)

A value that looks like a path (it starts with `.`, contains a separator, or is absolute) is treated
as a custom theme directory, resolved relative to the configuration file. Anything else is a built-in
theme name.

```yaml
html:
  theme: ./my-theme
```

The directory may contain any of these three files, and **whatever you leave out falls back to the
default theme**:

| File            | Replaces                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| `style.css`     | All CSS of the document (the default stylesheet is not merged in).       |
| `template.html` | The HTML skeleton, including where the sidebar, pages, and scripts go.    |
| `app.js`        | The client script: hash routing, search, table of contents, prev/next, dark mode, code-block controls, and the image lightbox. |

A style-only theme is therefore one file, and it keeps working when the client script gains features
in a later release. Replacing `app.js` means taking over every interactive behavior listed above.

A custom `template.html` must keep these tokens, which the build refuses to run without because the
document would be unusable:

```text
{{style}}  {{sidebar}}  {{pages}}  {{siteDataJson}}  {{appJs}}  {{bodyScripts}}
```

These are optional: `{{title}}`, `{{htmlAttrs}}` (initial color scheme), `{{bodyAttrs}}` and
`{{contentWidthTogglePressed}}` / `{{contentWidthToggleTitle}}` (content width), `{{generatorVersion}}`,
and the `{{#contentWidthToggle}}` / `{{#imageLightbox}}` / `{{#branding}}` / `{{#generatorVersion}}`
blocks. Dropping one just drops that feature from the output.

Because the output is a single self-contained file, a theme cannot reference external assets. Inline
fonts and images as data URIs in `style.css`. `monodocs watch` and `monodocs serve` also watch the
theme directory, so edits show up in the preview. A theme is executable code in your document — treat
it with the same trust as your documentation sources.

## Page order and titles

The order of pages in the sidebar and in the prev/next navigation is **independent of the display title**. `sidebar.titleFrom` and `sidebar.titleTransform` only change the **text shown on screen**; they never affect ordering. The order is decided in two steps:

1. **`order` (explicit, ascending)** — the frontmatter `order` (`:sd-order:` in AsciiDoc). Lower comes first.
2. **Filename (path) order** — pages without an `order` are sorted by their extension-stripped relative path (`localeCompare`). Pages that have an `order` always come first; pages without one fall to the end.

So even if `01_intro.md` displays as “intro” via `titleTransform: stripNumberPrefix`, **its position is decided by the filename that still contains `01_`**, not by the H1 heading. This lets you pin the order with a numeric prefix while cleaning up only the displayed text.

> Directory (sidebar folder) order follows the position of the first page that appears inside it — i.e. filename order as well.

### Page frontmatter

At the top of each page you can set the following — Markdown via YAML frontmatter, AsciiDoc via `:sd-*:` attributes. All are optional.

| Markdown frontmatter | AsciiDoc attribute | Type    | Description |
| -------------------- | ------------------ | ------- | ----------- |
| `title`              | `:sd-title:`       | string  | Explicit title. **Always wins** regardless of `titleFrom` / `titleTransform`, and is never transformed. |
| `order`              | `:sd-order:`       | number  | Sort order (ascending). Without it, pages fall back to filename order (pages that have an `order` come first). |
| `hidden`             | `:sd-hidden:`      | boolean | Exclude from the sidebar, prev/next nav, and search. The page HTML is still generated and reachable via its hash route. |
| `description`        | `:sd-description:` | string  | Page description (metadata). |

```yaml
---
title: Setup
order: 10
hidden: false
description: How to set up your environment
---
```

For AsciiDoc:

```asciidoc
= Setup
:sd-order: 10
```

## See also

- [Supported syntax](https://github.com/kuttsun/monodocs/blob/main/docs/syntax.md) — what is supported and what single-file bundling intentionally restricts.
- [Roadmap](https://github.com/kuttsun/monodocs/blob/main/docs/roadmap.md) — the version plan.

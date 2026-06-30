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
  runtime: cdn # cdn | inline

highlight:
  enabled: true

html:
  theme: default
  contentWidth: 860px # a CSS length, or "full" for the full available width
```

## Reference

### Top level

| Key      | Type   | Default           | Description                                                                                    |
| -------- | ------ | ----------------- | ---------------------------------------------------------------------------------------------- |
| `title`  | string | `Documentation`   | Title shown in the output HTML (`<title>` and header).                                          |
| `input`  | string | `./docs`          | Input directory to scan. The CLI input argument overrides this. Relative to the config file.   |

### `output`

| Key             | Type                  | Default               | Description                                                  |
| --------------- | --------------------- | --------------------- | ------------------------------------------------------------ |
| `output.format` | `html` `pdf` `both`   | `html`                | Output format. Overridden by `-f, --format`. PDF is planned. |
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
| `sidebar.exclude`            | string[]  | `['_partials/**', 'partials/**', 'includes/**', '**/_*']` | Glob patterns excluded from scanning. Files starting with `_` are treated as include/partial files regardless of extension. |
| `sidebar.collapseDepth`      | integer   | unset                                              | Collapse directories **deeper** than this level by default (top level = depth 1). `0` collapses everything, unset keeps all expanded. Pages stay reachable — collapsing hides nothing, it can always be re-opened. |
| `sidebar.titleFrom`          | `heading` `filename` | `heading`                               | Where the navigation title comes from. `heading` = explicit title → heading → filename. `filename` = skip the heading and use the filename (the explicit frontmatter / `:sd-title:` title always wins either way). |
| `sidebar.flattenSingleChild` | boolean   | `false`                                            | Flatten a directory that holds **exactly one page and no subfolders**, pulling that page up to its parent. Useful when each document lives in its own folder with its images (images are not counted as pages). |
| `sidebar.titleTransform`     | object    | `{ page: none, directory: none }`                  | Transform **derived** display titles (heading- or filename-based page titles, and directory names). The explicit frontmatter / `:sd-title:` title is never transformed, and routes / page IDs never change. See below. |

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

| Key               | Type           | Default | Description                                                              |
| ----------------- | -------------- | ------- | ------------------------------------------------------------------------ |
| `mermaid.enabled` | boolean        | `true`  | Render Mermaid code blocks as diagrams.                                   |
| `mermaid.runtime` | `cdn` `inline` | `cdn`   | Load the Mermaid runtime from a CDN, or inline it for fully offline output. |

### `highlight`

| Key                 | Type    | Default | Description                                  |
| ------------------- | ------- | ------- | -------------------------------------------- |
| `highlight.enabled` | boolean | `true`  | Syntax-highlight code blocks (via shiki).    |

### `html`

| Key                  | Type            | Default     | Description                                                                          |
| -------------------- | --------------- | ----------- | ------------------------------------------------------------------------------------ |
| `html.theme`         | string          | `default`   | Theme name used for the output HTML.                                                  |
| `html.contentWidth`  | string / number | `860px`     | Max width of the content area. A CSS length (`px`, `rem`, `em`, `ch`, `vw`, `%`) or a number (px). `full` (or `none`) expands to the full available width. |

## See also

- [Supported syntax](https://gitlab.com/kuttsun/monodocs/-/blob/main/docs/syntax.md) — what is supported and what single-file bundling intentionally restricts.
- [Roadmap](https://gitlab.com/kuttsun/monodocs/-/blob/main/docs/roadmap.md) — the version plan.

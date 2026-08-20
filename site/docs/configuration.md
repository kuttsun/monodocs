# Configuration

monodocs reads an optional `monodocs.config.yml` to control how your files are bundled into a single HTML. Without a config file the defaults below are used, so a config file is only needed when you want to override them.

## Where the config file lives

monodocs resolves the config file in this order:

1. The path passed to `-c, --config <file>`.
2. `monodocs.config.yml` **inside the input directory** (when you pass an input argument, e.g. `monodocs build ./docs`). When that argument is a single file, the directory holding it is used, so `monodocs build ./docs/plan.md` reads the same file as `monodocs build ./docs`.
3. `monodocs.config.yml` in the **current working directory** (when no input argument is given).

If you pass `--config` explicitly and the file does not exist, the build fails. Relative paths inside the config (`input`, `output.path`) are resolved **relative to the config file's location**, not the current directory.

```bash
# Auto-detect ./docs/monodocs.config.yml
monodocs build ./docs

# Use an explicit config file
monodocs build -c ./monodocs.config.yml
```

## Unknown keys

Every key is checked, at every depth, and an unrecognized one fails the build naming the key and the
object that holds it:

```text
error: Invalid config file ./monodocs.config.yml: pdf: Unrecognized key: "footr"
```

A key that is accepted and ignored is worse than one that is refused: the file looks right, and only
the output says otherwise. This holds at the top level too, so a key written ahead of the release
that introduces it has to come out until then.

## Precedence

Settings are merged in this order, highest first:

**CLI options** › **config file** › **defaults**

So `-o`, `--config`, and `-f` on the command line always win over the config file. Only `output.path`/`-o`, `output.format`/`-f`, and `input`/`<input arg>` are also settable on the CLI; everything else is config-file only.

## Full example

Every key is optional. This example lists them all with their default values:

```yaml
# Document title shown in the output HTML
title: Documentation

# Language of the generated document. Fills <html lang> and selects the UI label table.
# Any BCP 47 tag; label tables ship for en and ja, and anything else falls back to the en
# labels with a warning. This is not the language of the CLI's own messages.
lang: en

# Input directory (overridden by the CLI input argument)
input: ./docs

output:
  format: html # html | pdf | both
  path: ./dist/docs.html

sources:
  markdown:
    extensions: [.md, .markdown]
  asciidoc:
    extensions: [.adoc, .asciidoc, .asc]
  # Glob patterns that are never turned into pages. Added to the built-in list below, not
  # replacing it: ['_partials/**', 'partials/**', 'includes/**', '**/_*']
  # exclude: [drafts/**]
  # Set false to bundle the fragments that built-in list keeps out
  excludeDefaults: true

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
  # labels: # replace individual UI labels on top of the table lang chose
  #   tocTitle: On this page

pdf:
  pageSize: A4
  margin: { top: 20mm, right: 15mm, bottom: 20mm, left: 15mm }
  printBackground: true
  bookmarks: true # folder -> page outline, same structure as the HTML sidebar
  header: false # false, or an HTML fragment using Chromium's classes
  footer: '<div style="width:100%;margin:0 15pt;font-family:sans-serif;font-size:8pt;color:#666;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'

```

## Reference

### Top level {#top-level}

| Key      | Type   | Default           | Description                                                                                    |
| -------- | ------ | ----------------- | ---------------------------------------------------------------------------------------------- |
| `title`  | string | `Documentation`   | Title shown in the output HTML (`<title>` and header).                                          |
| `lang`   | string | `en`              | Language of the generated document. Fills `<html lang>` and selects the UI label table. See below. |
| `input`  | string | `./docs`          | Input path to scan: a directory, or a single source file. The CLI input argument overrides this. Relative to the config file. |

#### `lang` (document language and UI labels) {#lang}

A generated document carries two languages that have no reason to agree: the language its pages are
written in, and the language of the chrome monodocs wraps around them — the search box, `On this
page`, `No results`, `Copy`, the lightbox controls, prev/next. `lang` settles both: it fills
`<html lang>` and selects the label table.

```yaml
lang: ja
```

Any syntactically valid BCP 47 tag is accepted, because it is your document's language and
`<html lang>` has to be able to say so. A string that is not one is rejected rather than written into
the attribute.

Label tables ship for `en` (the default) and `ja` only. Tags are matched case-insensitively on the
primary language subtag, so `en-GB`, `ja-JP`, and `JA` all find one. Any other tag still reaches
`<html lang>`, falls back to the English labels, and warns once naming the tag — a French document
should not have to misdeclare itself as English just to build. Use [`html.labels`](#html-labels) to
supply the wording.

`lang` describes the document. It is deliberately not the language of the CLI's own messages: a
document is often written in one language by someone working in a terminal that reports another, and
a build log should not change language because the document did.

### `output`

| Key             | Type                  | Default               | Description                                                  |
| --------------- | --------------------- | --------------------- | ------------------------------------------------------------ |
| `output.format` | `html` `pdf` `both`   | `html`                | Output format. Overridden by `-f, --format`.                 |
| `output.path`   | string                | `./dist/docs.html`  | Output file path. Overridden by `-o, --output`. Relative to the config file. |

### `sources`

Controls which file extensions are treated as Markdown vs. AsciiDoc, and which files are left out of
the bundle entirely.

| Key                            | Type       | Default                       | Description |
| ------------------------------ | ---------- | ----------------------------- | ----------- |
| `sources.markdown.extensions`  | string[]   | `[.md, .markdown]`            | Extensions rendered as Markdown. |
| `sources.asciidoc.extensions`  | string[]   | `[.adoc, .asciidoc, .asc]`    | Extensions rendered as AsciiDoc. |
| `sources.exclude`              | string[]   | `[]`                          | Glob patterns, matched against the path relative to the input directory, whose matches are never turned into pages. **Added to the built-in list**, not replacing it. |
| `sources.excludeDefaults`      | boolean    | `true`                        | Whether the built-in list applies. Set `false` for a tree that really does bundle its `_`-prefixed files. |

The built-in list is `['_partials/**', 'partials/**', 'includes/**', '**/_*']` — the paths that hold
include fragments rather than pages. `sources.exclude` adds to it, because a list written to keep one
draft out of the bundle should not also hand back every fragment: that failure is silent, and it
surfaces far from its cause.

```yaml
sources:
  exclude: [drafts/**] # kept out, and so are _partials/** and the rest
```

A file named directly on the command line (`monodocs build ./docs/_draft.md`) is bundled whatever the
patterns say. Naming it is a choice; the patterns only decide what a directory scan picks up.

> `sidebar.exclude` was the earlier home for this key. It still works and now behaves the same way —
> merged rather than replacing — but it warns, because it never was a sidebar setting: a match is
> left out of the bundle, not just out of the navigation.

### `sidebar`

| Key                          | Type      | Default                                            | Description |
| ---------------------------- | --------- | -------------------------------------------------- | ----------- |
| `sidebar.mode`               | `folder` `custom` | `folder`                                   | How the sidebar is built. `folder` derives it from the directory structure. `custom` uses `sidebar.items` exactly as written. See below. |
| `sidebar.items`             | object[]  | unset                                              | The sidebar definition for `mode: custom`. Requires `mode: custom`, and `mode: custom` requires it. See below. |
| `sidebar.exclude`            | string[]  | unset                                              | **Deprecated** — use [`sources.exclude`](#sources). Still honoured, with a warning. |
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
`sidebar.flattenSingleChild` do not apply in this mode. `sidebar.collapseDepth`, `sources.exclude`,
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
| `html.labels`        | map     | (from `lang`) | Replace individual UI labels on top of the table [`lang`](#lang) chose. An unknown key is rejected. See below. |

#### `html.labels` (UI labels) {#html-labels}

Each entry replaces one label from the table `lang` selected; everything you leave out keeps the
table's wording. This is also how you supply a language monodocs does not ship a table for.

```yaml
lang: fr
html:
  labels:
    tocTitle: Sur cette page
    noResults: Aucun résultat
```

An unknown key is rejected rather than ignored, so a typo cannot silently keep the default. That
makes the key set part of the configuration surface, which is why it is enumerated here in full
rather than left to whatever the theme happens to read.

| Key                  | `en`                         | `ja`                       | Where it appears |
| -------------------- | ---------------------------- | -------------------------- | ---------------- |
| `openSidebar`        | Open sidebar                 | サイドバーを開く           | The ☰ button shown when the sidebar is closed |
| `closeSidebar`       | Close sidebar                | サイドバーを閉じる         | The « button in the sidebar header |
| `searchPlaceholder`  | Search…                      | 検索…                      | Placeholder in the search box |
| `searchLabel`        | Search documents             | ドキュメントを検索         | Accessible name of the search box |
| `searchResults`      | Search results               | 検索結果                   | Accessible name of the result list |
| `noResults`          | No results                   | 該当なし                   | Shown when a query matches nothing |
| `contentWidthToggle` | Toggle content width         | 本文幅を切り替え           | Accessible name of the width button |
| `useWideContent`     | Use wide content             | 本文を広く表示             | Width button tooltip while standard |
| `useStandardContent` | Use standard content width   | 本文を標準の幅で表示       | Width button tooltip while wide |
| `darkModeToggle`     | Toggle dark mode             | ダークモードを切り替え     | The dark mode button |
| `tocLabel`           | Table of contents            | 目次                       | Accessible name of the in-page table of contents |
| `tocTitle`           | On this page                 | このページの内容           | Heading above the in-page table of contents |
| `pageNavLabel`       | Page navigation              | ページ移動                 | Accessible name of the prev/next navigation |
| `prev`               | ← Prev                       | ← 前へ                     | Previous-page link |
| `next`               | Next →                       | 次へ →                     | Next-page link |
| `wrapToggle`         | Toggle word wrap             | 折り返しを切り替え         | Word-wrap button on a code block |
| `copyCode`           | Copy code                    | コードをコピー             | Accessible name of the copy button |
| `copy`               | Copy                         | コピー                     | Copy button tooltip |
| `copied`             | Copied!                      | コピーしました             | Shown after a successful copy |
| `copyFailed`         | Copy failed                  | コピーできませんでした     | Shown when a copy fails |
| `openImagePreview`   | Open image preview           | 画像を拡大表示             | Accessible name of an enlargeable image |
| `imagePreview`       | Image preview                | 画像プレビュー             | Accessible name of the lightbox dialog |
| `closeImagePreview`  | Close image preview          | 画像プレビューを閉じる     | Close button in the lightbox |
| `generatedBy`        | Generated by                 | 生成:                      | Prefix of the branding footer |

What a custom theme gets is bounded by the theme contract, and the four cases differ:

- **Every theme** gets the resolved labels as data in <span v-pre>`{{siteDataJson}}`</span>. This is the only
  unqualified guarantee.
- **The default `app.js`** applies them to the DOM hooks the default template provides, so a theme
  that replaces only `style.css` behaves exactly as the built-in one does. A theme that replaces
  `template.html` gets them wherever it kept those hooks, through <span v-pre>`{{labelTocTitle}}`</span> and the other
  <span v-pre>`{{label…}}`</span> tokens, and nowhere else.
- **A theme replacing `app.js`** receives the data and applies it itself.
- **Static text a custom `template.html` spells out itself** stays as written. monodocs cannot know
  which strings in someone else's markup were meant to be labels.

<span v-pre>`{{lang}}`</span> is an optional token, so a custom template that hardcodes `<html lang="…">` keeps what it
wrote.

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

The rest are optional, and dropping one just drops the feature it carries:

```text
{{title}}                                                    document title
{{htmlAttrs}}                                                initial color scheme
{{bodyAttrs}} {{contentWidthTogglePressed}} {{contentWidthToggleTitle}}   content-width control
{{generatorVersion}}                                         version in the branding footer
{{#contentWidthToggle}} {{#imageLightbox}} {{#branding}} {{#generatorVersion}}   optional blocks
```

Because the output is a single self-contained file, a theme cannot reference external assets. Inline
fonts and images as data URIs in `style.css`. `monodocs watch` and `monodocs serve` also watch the
theme directory, so edits show up in the preview. A theme is executable code in your document — treat
it with the same trust as your documentation sources.

### `pdf`

Applies when the output format is `pdf` or `both`.

| Key                   | Type              | Default   | Description |
| --------------------- | ----------------- | --------- | ----------- |
| `pdf.pageSize`        | string            | `A4`      | Paper size, passed to Chromium as its `format` (`A4`, `Letter`, `A3`, …). |
| `pdf.margin`          | map               | `20mm` / `15mm` / `20mm` / `15mm` | Page margins as CSS lengths, per side (`top`, `right`, `bottom`, `left`). An omitted side keeps its default. |
| `pdf.printBackground` | boolean           | `true`    | Print background colours and images. |
| `pdf.bookmarks`       | boolean           | `true`    | Add a bookmark outline with the same folder → page structure as the HTML sidebar. |
| `pdf.header`          | `false` / string  | `false`   | The band at the top of every page. See below. |
| `pdf.footer`          | `false` / string  | page number | The band at the bottom of every page. See below. |

#### `pdf.header` / `pdf.footer` (page bands) {#pdf-bands}

By default every page carries its number and the total, centred at the foot:

```text
3 / 12
```

Digits and a separator, deliberately: this is the one piece of text monodocs adds to every page, and
in this form it needs no translation and does not change with [`lang`](#lang).

Both keys take `false` to remove the band, or an HTML fragment to replace it:

```yaml
pdf:
  header: '<div style="width:100%;font-size:8pt;text-align:right;margin:0 15pt"><span class="title"></span></div>'
  footer: false
```

The fragment is handed to Chromium, which substitutes into elements carrying **its own classes** —
`pageNumber`, `totalPages`, `title`, `date`, `url`. There is no <span v-pre>`{{token}}`</span> syntax: the fragment is
already HTML, and putting monodocs tokens over Chromium's classes would add a substitution and
escaping layer for no gain.

Two things are easy to be caught by:

- **A fragment inherits none of the document's styles.** Set the font and size yourself, as the
  examples do, or you get Chromium's unstyled default rather than something matching your pages.
- **The band lives in the margin.** Chromium sizes it to the top and bottom margins rather than
  taking space from the content, so nothing reflows — but a margin smaller than the band leaves the
  band against the paper edge. monodocs warns when the bottom margin is smaller than the default
  footer needs, measuring that footer rather than comparing against a fixed number. **A replacement
  fragment is not checked**: whether arbitrary HTML and CSS fit cannot be judged from the margin
  value alone, and a check that pretended otherwise would either warn falsely or promise something
  only measurement could keep.

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

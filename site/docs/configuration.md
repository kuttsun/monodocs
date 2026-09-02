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

# What to do when the machine running the build lacks a font the document needs.
# Covers PDF output and mermaid pre-render alike, which is why it is top level.
fontCheck: warn # warn | error | off

# What the document says about itself. Every field is optional and none is interpreted:
# the date is not parsed and the version is not compared to anything. Unset by default.
# document:
#   version: "1.2"
#   date: "2026-08-22"
#   authors: [Documentation Team]

# Input directory (overridden by the CLI input argument)
input: ./docs

# What every relative path resolves against. Defaults to input's value.
# Write it, with sources.include, to build one document from more than one directory.
# root: "."

output:
  format: html # html | pdf | both
  path: ./dist/docs.html

sources:
  markdown:
    extensions: [.md, .markdown]
  asciidoc:
    extensions: [.adoc, .asciidoc, .asc]
  # Glob patterns, relative to root, selecting what may become a page. Unset, everything under
  # root is a candidate. exclude subtracts from this, and subtracts last.
  # include: [README.md, docs/**]
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
  density: normal # relaxed | normal | compact | tight, or an object (see below)
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
| `fontCheck` | `warn` `error` `off` | `warn` | What to do when the build machine lacks a font the document needs. See below. |
| `input`  | string | `./docs`          | Input path to scan: a directory, or a single source file. The CLI input argument overrides this. Relative to the config file. |
| `root`   | string | value of `input`  | The directory every relative path resolves against: routes, images, `include::`, and the config file. See below. |
| `document` | object | unset | What the document says about itself: `version`, `date`, `authors`. See below. |

#### `root` (building one document from more than one directory) {#root}

A repository usually keeps its `README.md` at the top and its pages under `docs/`. `input` names one
directory, so those two cannot be one document. Letting `input` take a list would be the obvious fix
and the wrong one: one root answers four questions at once — where `monodocs.config.yml` is looked
for, what a route is relative to, which directory an image may be read from, and how far an AsciiDoc
`include::` may reach — and two roots leave every one of them with two answers.

So the root stays single and the **selection** becomes configurable:

```yaml
root: "."
sources:
  include:
    - "README.md"
    - "docs/**"
```

`root` defaults to `input`'s value, so a configuration that does not write it keeps its meaning
exactly: `input: ./docs` is `root: ./docs` with everything under it included.

Routes come from the path relative to `root`. Adding `README.md` to a `docs/` tree therefore changes
the routes of every page in it — `docs/index.md` becomes `/docs` rather than `/`. That is a real
cost, and the honest one: the document now holds two trees.

Write `input` and `root` together only when they name the same directory. Anything else is a
configuration error rather than a merge, including an `input` that points *inside* `root` — such an
input is either the include list written out longhand or a second root in disguise. The rule covers
the command line too, so `monodocs build ./docs` against a configuration that sets `root: "."` stops
rather than silently picking one.

Written without `input`, `root` is what the build is pointed at, rather than the default `./docs`. `root` has to name a directory: it is what routes, images, and `include::` resolve against, and a file cannot be that.

One consequence worth knowing: the built-in exclude patterns are anchored at the root. `_partials/**`
matches a directory at the top of the root, so under `root: "."` a `docs/_partials/` is not matched
by it — name it in `sources.exclude` if you want it left out. A file whose own name starts with `_`
is still matched at any depth by `**/_*`.

#### `document` (what the document says about itself) {#document}

A specification handed to someone carries a version and a date, and often the people responsible for
it. A reader holding `docs.html` six months later otherwise has no way to tell what it is a version
of, or when it was true.

```yaml
title: Internal Documentation
document:
  version: "1.2"
  date: "2026-08-22"
  authors:
    - Documentation Team
```

| Key       | Type     | Description                                        |
| --------- | -------- | -------------------------------------------------- |
| `version` | string   | Version of the document. Not compared to anything.  |
| `date`    | string   | Date as you write it. Not parsed into a calendar.   |
| `authors` | string[] | The people responsible for the document.            |

Every field is optional and every field is a string monodocs does not interpret — the one thing it
does to the text is trim the space around it, so a value that is only whitespace counts as unset.
What they do is reach three places:

- The **footer** at the end of the HTML and the PDF, as one line: `Version 1.2 · 2026-08-22 ·
  Documentation Team`. The word `Version` comes from the label table `lang` selects, so it follows
  the document's language and can be replaced through [`html.labels`](#labels)
- The **PDF's document properties**: the authors become `Author`, the version and date become
  `Subject`, and both values as you wrote them become `Keywords`
- Nothing else. `title` stays at the top level rather than moving in here

**The build stamps no date of its own.** A date in the output is a date you wrote. Filling the footer
with the moment the build ran would make the same input produce different bytes on every run, so a
committed `docs.html` would show a diff whenever anyone rebuilt it. A workflow that wants the build
date sets `document.date` from the workflow, and then the date is a decision rather than an accident.

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

#### `fontCheck` (missing fonts) {#font-check}

An artifact is composed once, on the machine that runs the build, with the fonts that machine
happens to have — and a character with no font becomes tofu (□ / ☒) permanently, in every copy that
is then handed out. Japanese text needs a CJK font and emoji need an emoji font, and a CI runner
cannot be assumed to carry either.

```yaml
fontCheck: warn # warn (default) | error | off
```

`warn` names the characters at risk and keeps building. `error` exits non-zero, for a pipeline that
would rather stop than publish tofu, and no PDF is written. With `--format both` the HTML is written
before the PDF is printed, so `error` leaves that HTML in place, and a PDF from an earlier build
where it is — clean the output directory if a pipeline reads it. `off` does not measure at all.

The check runs where the fonts are actually decided:

- **PDF output**, in the browser that is already open to print it, so it costs no extra startup.
- **`mermaid.mode: pre-render`**, which measures and positions diagram text with the build machine's
  fonts and bakes the result into the SVG — a missing font is baked in there too, in the HTML as
  much as in the PDF. That is why this key is top level rather than under `pdf`.

Plain HTML output is not measured, and needs no measuring: it is drawn with the reader's fonts.

What it reports is the characters themselves, with an example of a font that covers them:

```text
warning: No font on the machine running this build draws 2 character(s) this document uses, so they
come out as tofu (□ / ☒) in the PDF — permanently, in every copy of it. At risk: 日 (U+65E5, e.g.
Noto Sans CJK); ✅ (U+2705, e.g. Noto Color Emoji). Install a font that covers them …
```

The example is a **font face, not a package**: what supplies a face differs across Debian, Windows,
and every other platform, and naming the wrong package is worse than naming none. On Debian and
Ubuntu the usual answer is `fonts-noto-cjk` and `fonts-noto-color-emoji` — the [CI guide](/docs/ci)
installs both.

What it does and does not see:

- **Only what will be drawn is measured.** The sidebar, the table of contents, and the search
  results are hidden when printing, so a character that appears only there is not reported. What
  counts as hidden is `display: none`, `content-visibility: hidden`, and `visibility: hidden`.
- **The unit is the grapheme cluster**, together with the font of the element it appears in, so a
  variation sequence or an emoji ZWJ sequence is judged as the unit it is drawn as, not as separate
  codepoints. A long list is cut short with a count of the rest rather than silently truncated.
- **It is a heuristic** over the browser's font fallback: each cluster is compared against a
  private-use codepoint no font is expected to draw, and a hit is confirmed by rasterising it. That
  is why `warn` is the default — a false positive must not be able to break a build that would
  otherwise have been fine. Choosing `error` accepts that one stops CI too.
- **It checks its own reference**, against a second private-use codepoint and a noncharacter. If
  this machine turns out to draw something that should have no glyph, the check says so and reports
  nothing else, rather than producing findings it cannot stand behind. If it runs out of patience
  before the end of a very large document, it says that too rather than reporting a clean bill.
- **The default page-number footer is measured too.** A replacement `pdf.header` / `pdf.footer`
  fragment is not: it is arbitrary HTML that brings a font of its own.

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
| `sources.include`              | string[]   | unset                         | Glob patterns, relative to `root`, selecting what may become a page. Unset, everything under `root` is a candidate. `sources.exclude` subtracts from this, and subtracts last. A negated pattern (`!…`) is refused in both lists: patterns are combined with OR, so a negated one matches almost every path. |
| `sources.exclude`              | string[]   | `[]`                          | Glob patterns, matched against the path relative to `root`, whose matches are never turned into pages. **Added to the built-in list**, not replacing it. |
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

> **Fonts caveat**: `pre-render` measures and positions text using the fonts of **the machine running the build**, then bakes the result into the SVG. Diagrams with non-Latin labels (e.g. Japanese) render as boxes or wrap incorrectly if the build environment lacks the needed font (e.g. Noto CJK). `client` uses the reader's fonts, so it is not affected. Note that when installed via npm, what matters is **your build environment's fonts** — monodocs cannot supply them. [`fontCheck`](#font-check) warns when a diagram needs a font this machine does not have.

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
| `version`            | Version                      | バージョン                 | Before `document.version` in the footer |

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

Applies when the output format is `pdf` or `both` — with two exceptions.
[`pdf.density`](#pdf-density) and [`pdf.pageBreakLevel`](#pdf-page-break-level) are written into the
HTML as well, because printing that HTML from a browser is the same act of putting the document on
paper.

| Key                   | Type              | Default   | Description |
| --------------------- | ----------------- | --------- | ----------- |
| `pdf.pageSize`        | string            | `A4`      | Paper size, passed to Chromium as its `format` (`A4`, `Letter`, `A3`, …). |
| `pdf.margin`          | map               | `20mm` / `15mm` / `20mm` / `15mm` | Page margins as CSS lengths, per side (`top`, `right`, `bottom`, `left`). An omitted side keeps its default. |
| `pdf.printBackground` | boolean           | `true`    | Print background colours and images. |
| `pdf.density`         | string / map      | `normal`  | How tightly the page is set: `relaxed`, `normal`, `compact`, `tight`, or an object. See below. |
| `pdf.pageBreakLevel`  | `false` / 2–6     | `false`   | Start a new sheet before every heading down to this level: `2` is h2 only, `6` is h2 through h6. See below. |
| `pdf.bookmarks`       | boolean           | `true`    | Add a bookmark outline with the same folder → page structure as the HTML sidebar. |
| `pdf.header`          | `false` / string  | `false`   | The band at the top of every page. See below. |
| `pdf.footer`          | `false` / string  | page number | The band at the bottom of every page. See below. |

#### `pdf.density` (how tightly the page is set) {#pdf-density}

`pdf.margin` decides where the text starts, not how much of it fits. What decides a page count is
type size, leading, the space above headings, and the padding inside table cells. `pdf.density`
moves those four together:

```yaml
pdf:
  density: compact
```

| | `fontSize` | `lineHeight` | `headingSpacing` | `tableCellPadding` |
| --- | --- | --- | --- | --- |
| `relaxed` | `16px` | `1.7` | `1.8em` | `0.5rem 0.8rem` |
| `normal` (default) | `16px` | `1.45` | `0.9em` | `0.35rem 0.6rem` |
| `compact` | `14px` | `1.35` | `0.8em` | `0.3rem 0.5rem` |
| `tight` | `12px` | `1.3` | `0.6em` | `0.2rem 0.35rem` |

**The default is set for paper, not for a screen.** A stylesheet written for reading on a screen is
generous with leading and with the air above headings, and on paper that generosity is what a page
count pays for. Between `relaxed` and `normal` the type size does not change at all — both set the
body at 16px — and the same document still comes out on fewer sheets. See the four of them
[side by side](#pdf-density-sample) below.

**`relaxed` is the screen setting under a name**, for a document that is read on a screen and printed
only now and then.

**Type size is the last lever, not the first.** The width of the text column is whatever `pdf.margin`
leaves — a density does not narrow it — so each step down in type size is also a step up in the
number of characters on a line. At the default A4 margins that is roughly 42 Japanese characters at
16px and around 56 at 12px. If you want `compact` or `tight` without the longer line, widen
`pdf.margin` in the same change.

To adjust a preset, give an object instead of a name. `base` says which preset to start from
(default `normal`), and the object replaces only what it names — so changing one value does not mean
copying the other three, and a preset retuned in a later release still reaches you:

```yaml
pdf:
  density:
    base: compact
    fontSize: 12px
    lineHeight: 1.5
```

`fontSize` and `headingSpacing` take a CSS length (a number and one of `px`, `pt`, `mm`, `cm`, `in`,
`rem`, `em`, or plain `0`). `lineHeight` takes a positive number with no unit. `tableCellPadding`
takes one or two lengths, as CSS padding does. Anything else — `calc(...)`, a value with something
after it — is refused rather than written into the stylesheet.

Two things follow from where the rules live:

- **Only what differs from the screen is written.** `relaxed` is a record of what the theme already
  does, so asking for it produces no print rules at all. The default writes leading, heading spacing,
  and cell padding — but no font size, because it does not change one, so printing this HTML from
  your browser still uses your own base font size.
- **The rules are `@media print`.** The same file stays as it was on screen and is set tighter on
  paper. `--format pdf` goes through the print stylesheet and gets the density; so does printing the
  HTML from a browser. The key sits under `pdf` because that is what it is for.

##### The four presets on the same document {#pdf-density-sample}

One source, one paper size, one set of margins, built four times with nothing changed but
`pdf.density`. Each thumbnail is the first page of the PDF beside it.

<div class="density-samples">
  <figure>
    <a href="../density/relaxed.pdf" target="_blank" rel="noopener">
      <img src="/density/relaxed.png" alt="First page at the relaxed density" loading="lazy">
    </a>
    <figcaption><code>relaxed</code> — 5 sheets</figcaption>
  </figure>
  <figure>
    <a href="../density/normal.pdf" target="_blank" rel="noopener">
      <img src="/density/normal.png" alt="First page at the normal density" loading="lazy">
    </a>
    <figcaption><code>normal</code> (default) — 4 sheets</figcaption>
  </figure>
  <figure>
    <a href="../density/compact.pdf" target="_blank" rel="noopener">
      <img src="/density/compact.png" alt="First page at the compact density" loading="lazy">
    </a>
    <figcaption><code>compact</code> — 3 sheets</figcaption>
  </figure>
  <figure>
    <a href="../density/tight.pdf" target="_blank" rel="noopener">
      <img src="/density/tight.png" alt="First page at the tight density" loading="lazy">
    </a>
    <figcaption><code>tight</code> — 2 sheets</figcaption>
  </figure>
</div>

The document itself says what to look at on each page. Read one on paper before choosing: a density
that looks fine at 100% on a screen can be a page nobody wants to read at arm's length.

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

#### `pdf.pageBreakLevel` (a sheet per section) {#pdf-page-break-level}

A source file already starts a new sheet. For a document whose sections each have to begin on one —
a specification, a set of regulations, anything handed over on paper — this starts one before every
heading down to the level you name:

```yaml
pdf:
  pageBreakLevel: 2
```

`2` is h2 only, `3` is h2 and h3, `6` is h2 through h6. `false`, the default, breaks before no
heading and leaves every existing document exactly as it is. h1 is not a level here: it is the page
title, and the file it titles has already started a sheet.

**A heading breaks unless nothing renders before it, or the only thing that does is the page title.**
So a page that opens with its title and goes straight into `## Section` keeps them together — the
alternative is a sheet holding one line — while a page whose title is followed by an introduction
does break before the section, because the introduction belongs on the title's sheet.

Two more things this rule implies:

- **A heading inside a block that must not be split is left alone** — a table, a figure, a code
  block, an admonition, a blockquote. Holding the block together and breaking inside it are not both
  possible.
- **A heading straight after a manual page-break marker is left alone**, since the marker has
  already broken there. Two forced breaks in a row would leave a blank sheet between them.

The space the density leaves above a heading goes with it: a heading that starts a sheet sits at the
top margin rather than pushed down by the gap that separates sections in the middle of a page.

#### Page breaks {#page-breaks}

Where a sheet ends is a decision the document makes, not the configuration. A source file always
starts a new sheet; inside a file, a marker of your own starts one:

```markdown
The last paragraph before the break.

<div class="page-break"></div>

The first paragraph of the new sheet.
```

```asciidoc
The last paragraph before the break.

<<<

The first paragraph of the new sheet.
```

AsciiDoc's `<<<` is Asciidoctor's own page break. In Markdown the marker is the empty `<div>` that
Markdown-to-PDF tools have settled on — `<div style="page-break-after: always"></div>` is accepted
as the same thing — and it stays invisible where the source is read, because an empty `div` renders
as nothing.

Markdown raw HTML is otherwise dropped, and that has not changed: monodocs matches the marker and
replaces it with an element it builds itself, so no attribute of yours reaches the output. Anything
else — a second attribute, an extra class, text between the tags — is dropped like any other raw
HTML rather than repaired.

**Exactly what counts as the marker** in Markdown, since 1.0 will freeze it:

- The element is a lowercase `div`, and it carries exactly one attribute: `class="page-break"` or
  `style="page-break-after: always"`.
- Either quoting works: `"page-break"` and `'page-break'` are the same marker.
- In the `style` spelling the colon may be followed by spaces or tabs, or by nothing, and a trailing
  `;` is allowed — `style="page-break-after:always;"` is the same marker. Anything beyond that one
  declaration is not.
- ASCII whitespace — space, tab, carriage return, line feed — is allowed around the `=`,
  before the `>`, and around the marker itself, and **at least one** is required after `<div`.
  Nothing at all is allowed **between** `>` and `</div>`, not even a space.
- Everything else is dropped: `<DIV>`, `class="page-break foo"`, a second attribute, a self-closing
  `<div class="page-break"/>`, a newline between the colon and `always`, and any further declaration
  inside `style`.

Two more things follow from a break being a break:

- **In Markdown, a marker must be a block of its own.** One inside a blockquote, a list item, a
  table cell, or a heading is not recognised and is dropped: those are the blocks the print layout
  keeps together. (In AsciiDoc, where `<<<` is Asciidoctor's own construct, the element lands
  wherever Asciidoctor puts it — so keep `<<<` at the top level there too.)
- **A marker with nothing after it leaves a blank sheet**, and so do two markers in a row. That is
  how you ask for one.

The rule is `@media print`, so it applies to `--format pdf` and to a reader printing the HTML.

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
| `aliases`            | `:sd-aliases:`     | string[] | Old hash routes this page still answers to. See below. |

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

#### `aliases` (keeping an old link working) {#aliases}

A hash route is a link a reader copies. In a document that travels as a single file it is the only
way one person tells another where to look, so it ends up in a chat log, a ticket, another document
— and renaming the page behind it breaks every copy silently. The reader who follows one lands on a
document that looks fine and shows the wrong page.

```yaml
---
title: Installation
aliases:
  - /setup/install
  - /getting-started/install
---
```

```asciidoc
= Installation
:sd-aliases: /setup/install, /getting-started/install
```

An alias is an old route that now resolves to this page. When a hash matches no page, the document
consults the table, replaces the hash with the current route, and renders the page — so the address
bar ends up holding the link that will still work next time. A route carrying an anchor
(`#/setup/install#configuration`) keeps the anchor across the substitution, because the anchor names
a heading rather than a path.

The rules are checked at build time rather than discovered by a reader:

- An alias is matched **after** every real route, so it can never shadow a page. A page that arrives
  at a route some other page claims as an alias wins, and the alias warns that it has been shadowed
  rather than silently taking precedence.
- **Two pages claiming the same alias is an error.** One of them would win by scan order, which is
  not something you can reason about.
- An alias is normalised the way a route is — leading slash, no extension, `index` meaning the
  directory — so `setup/install.md`, `/setup/install`, and `setup/install` are one alias, not three.
- An alias appears in neither the sidebar, the search index, nor the previous/next order. It is not
  a page; it is a name a page answers to. A `hidden` page keeps its aliases, because a link someone
  already holds is not navigation.

No alias is generated automatically. monodocs could read every route a file has ever had out of the
repository's history, and the document's link table would then depend on which clone built it — a
shallow checkout in CI would produce a different file from a full one. An alias is a line you wrote.

## See also

- [Supported syntax](https://github.com/kuttsun/monodocs/blob/main/docs/syntax.md) — what is supported and what single-file bundling intentionally restricts.
- [Roadmap](https://github.com/kuttsun/monodocs/blob/main/docs/roadmap.md) — the version plan.

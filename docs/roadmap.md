# monodocs ROADMAP

[日本語](ja/roadmap.md)

## 1. Overview

`monodocs` is a tool that generates a single HTML or PDF document from multiple Markdown / AsciiDoc files.

Its purpose is to allow documentation to be managed as multiple split files while being consolidated into a single file for distribution.

The main features are as follows.

- Combine multiple Markdown files into a single HTML
- Combine multiple AsciiDoc files into a single HTML
- Support a mix of Markdown / AsciiDoc
- Automatically generate a sidebar table of contents that follows the folder structure
- Allow the sidebar table of contents to be customized via a configuration file
- Use Markdown / AsciiDoc titles in the sidebar
- Embed images inside the HTML
- Support diagram notations such as Mermaid
- Support GitHub Flavored Markdown
- Produce PDF output based on the single HTML
- Assume multiple delivery forms such as CLI / npm / GitHub Actions / VS Code extension

`monodocs` does not directly aim to be a replacement for Pandoc.
Its main goal is to build a **lightweight documentation generator specialized in single-file distribution**.

---

## 2. Background

Pandoc's `chunkedhtml` can split a document into multiple HTML files, but it is weak for uses such as the following.

- You want a documentation-site-style sidebar
- You want to automatically generate a table of contents that follows the folder structure
- You want to combine multiple Markdown / AsciiDoc files into a single HTML
- You want a self-contained HTML that also includes images and Mermaid
- You want output not only as HTML but also as PDF
- You want to use it easily from VS Code or CI

In `monodocs`, the management of input files remains split, and only the output is made into a single file.

---

## 3. Goals

### 3.1 Initial Goal

The first goal is to build a CLI tool that satisfies the following.

```bash
monodocs build ./docs -o ./dist/docs.html
```

Input example:

```text
docs/
  index.md
  setup/
    install.md
    config.adoc
  guide/
    usage.md
    faq.adoc
```

Output example:

```text
dist/
  docs.html
```

### 3.2 Mid-term Goals

- Stably process mixed Markdown / AsciiDoc documents
- Embed images inside the HTML
- Display Mermaid
- Convert cross-links between Markdown / AsciiDoc into links within the single HTML
- Generate PDF from HTML
- Enable automatic generation in CI/CD

### 3.3 Long-term Goals

- Provide it as a VS Code extension
- Make it usable as a GitHub Action
- Provide a standalone binary
- Make themes and layouts extensible

---

## 4. Product Name

Repository name:

```text
monodocs
```

CLI name:

```bash
monodocs
```

npm package name:

```text
monodocs
```

> The former name was `single-docs`. The CLI command has been unified to `monodocs` (`single-docs` / `sdocs` were not adopted because the names conflict with existing tools).

---

## 5. Basic Concept

`monodocs` first normalizes multiple source files into a common `Page` model, and then outputs to HTML / PDF.

```text
Markdown files
AsciiDoc files
      ↓
Source Renderer
      ↓
Page[]
      ↓
sidebar / links / assets / search
      ↓
single HTML
      ↓
optional PDF
```

The important point is not to try to handle Markdown and AsciiDoc directly with the same processing.
Each is processed with a dedicated renderer, and ultimately converted into the common `Page` model.

---

## 6. Supported Formats

### 6.1 Markdown

Supported extensions:

```text
.md
.markdown
```

Planned support:

- CommonMark
- GitHub Flavored Markdown
- tables
- task lists
- strikethrough
- autolinks
- fenced code blocks
- YAML frontmatter

### 6.2 AsciiDoc

Supported extensions:

```text
.adoc
.asciidoc
.asc
```

Planned support:

- document title
- section headings
- attributes
- xref
- image macro
- source block
- include directive
- Mermaid source block

The initial implementation uses Asciidoctor.js.

### 6.3 Mixed Support

Allow Markdown and AsciiDoc to be mixed within the same directory.

Example:

```text
docs/
  index.md
  setup/
    install.adoc
    config.md
  guide/
    usage.adoc
    faq.md
```

### 6.4 Math (decided in v0.14)

Math is unsupported, and syntax.md gives the reason: keeping the HTML self-contained means not
introducing a MathJax or KaTeX dependency. The reason is out of date rather than wrong. KaTeX can
render to **MathML only** at build time, which puts no JavaScript and no stylesheet in the output —
the browser draws the formula, and Chromium has implemented MathML Core since version 109, so it
reaches the PDF as well.

What does not go away is the font. MathML is drawn with an OpenType MATH font, so a machine without
one produces the wrong glyphs, and the check for exactly that already exists (24.3.3) and would need
to cover formulas. And the harder half was never the rendering: it is choosing what an author
writes. `$...$` collides with prose about currency, `$$...$$` is a convention rather than a
standard, `\(...\)` is unambiguous and unfamiliar, and whatever is chosen has to have an AsciiDoc
counterpart (`stem`, `latexmath`), agree with what search indexes, and produce something sensible
when a reader copies it.

v0.14 answers this with a measurement rather than an opinion: a sample document of real formulas,
built to HTML and PDF, on both supported platforms, looked at. If the result is good, math is a 1.x
feature with a notation chosen in the open; if it is not, the limitation stays and syntax.md records
this reason instead of the one that has stopped being true.
---

## 7. Output Formats

### 7.1 HTML

The first output format to be supported.

```bash
monodocs build ./docs -o ./dist/docs.html
```

Or:

```bash
monodocs build ./docs --format html -o ./dist/docs.html
```

The HTML is made into a file that is as self-contained as possible.

What is included:

- HTML
- CSS
- JavaScript
- sidebar structure
- page body
- search index
- image data URI
- Mermaid client-side runtime

### 7.2 PDF

After HTML is generated, convert it to PDF using Playwright or Puppeteer.

```bash
monodocs build ./docs --format pdf -o ./dist/docs.pdf
```

Or:

```bash
monodocs build ./docs --format both -o ./dist/
```

Internal processing:

```text
Markdown / AsciiDoc
  ↓
single HTML
  ↓
headless browser
  ↓
PDF
```

PDF output will be supported after HTML output stabilizes.

---

## 8. Delivery Forms

### 8.1 CLI

The first to be implemented.

```bash
monodocs build ./docs -o ./dist/docs.html
```

### 8.2 npm Package

Global install:

```bash
npm install -g monodocs
```

One-off execution:

```bash
npx monodocs build ./docs -o ./dist/docs.html
```

Project-local introduction:

```bash
npm install -D monodocs
```

`package.json` example:

```json
{
  "scripts": {
    "docs:build": "monodocs build"
  }
}
```

### 8.3 Docker

An official image was listed here as a delivery form for CI and in-house environments. It is **not**
provided. The argument that settled Homebrew / Scoop / winget (8.5) applies unchanged: an image is a
Dockerfile to keep in sync with every release, a registry account and its credentials, a base image
whose own security advisories arrive on someone else's schedule, and a support channel where problems
are reported outside this repository. The cost recurs per release and per base-image advisory, and a
single maintainer pays it.

What the image would have supplied is already reachable. CI runners get monodocs through `npx` (8.4),
and the one step an image would have saved — installing Chromium and the fonts that PDF output
needs — is a two-line block in the documentation site's CI guide. Anyone who wants monodocs inside a
container adds those lines to an image they already control and already rebuild. Revisit only if
users report that npm and the release binary are genuinely insufficient.

This says nothing about `Dockerfile.dev`, which builds this repository's development image and stays.

### 8.4 GitHub Actions

No dedicated action is published; a workflow calls the npm CLI directly.

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx --yes monodocs build ./docs -o ./dist/docs.html
```

### 8.5 Standalone Binary

Already supported (v0.8). Every published GitHub Release carries a single executable per supported
platform, built with Node 22's Single Executable Application support (`pnpm build:bin`), plus a
`.sha256` file for verification and a `-NOTICES.txt` file. The binary embeds the npm dependencies and
the Node.js runtime, and their licenses require the notices to travel with the redistributed
artifact — a binary alone cannot carry them, so `pnpm build:bin` assembles the monodocs license, the
Node.js license of the runtime it copied, and the generated third-party notices into one file that
the release publishes next to each binary.

```text
monodocs-linux-x64
monodocs-windows-x64.exe
```

Only the two platforms monodocs supports are published. macOS builds were listed in the original plan
but are not produced: macOS is not in the supported set (it has no built-in browser detection either),
and a build that can only ever be exercised on a CI runner would be published without anyone being
able to reproduce a user's problem. Add them when macOS becomes a supported platform.

PDF output and Mermaid `pre-render` are not available in the binary, because `puppeteer-core` is kept
out of the bundle (chapter 21.2). The command fails with an explanatory message instead of degrading
silently, and PR CI asserts that failure on both platforms so the limitation cannot rot.

The binaries are unsigned. Code signing needs a certificate and a key-handling process that a single
maintainer cannot run safely yet, so the documentation warns about the Windows SmartScreen prompt
instead.

Homebrew, Scoop, and winget packaging is **not** provided. Each one adds a manifest to keep in sync
with every release, its own review or submission process, and a support channel where problems are
reported outside this repository — a recurring cost per release that a single maintainer pays for
every version. The two ways to install monodocs already cover its audience without any of that: `npm
install -g monodocs` for anyone who has Node.js, and a release binary that needs nothing installed.
Revisit only if users report that the current two are genuinely insufficient.

### 8.6 VS Code Extension

Frozen; see v0.7 in the roadmap section.

Assumed features:

- Build Single HTML
- Build PDF
- Preview
- Validate Links
- Create Config
- Watch Preview

---

## 9. Recommended Technology Stack

### 9.1 Language

```text
TypeScript
Node.js
```

### 9.2 Markdown

```text
unified
remark-parse
remark-gfm
remark-frontmatter
remark-rehype
rehype-stringify
rehype-slug
rehype-autolink-headings
```

### 9.3 AsciiDoc

```text
asciidoctor.js
```

### 9.4 HTML Post-processing

```text
rehype
hast
parse5
```

### 9.5 Code Highlighting

```text
shiki
```

### 9.6 Mermaid

Initial:

```text
mermaid
```

Future:

```text
@mermaid-js/mermaid-cli
```

### 9.7 PDF

```text
playwright
```

Or:

```text
puppeteer
```

### 9.8 CLI

```text
commander
chokidar
```

### 9.9 Configuration File

```text
yaml
zod
```

### 9.10 Testing

```text
vitest
```

### 9.11 Package Management

```text
pnpm workspace
```

---

## 10. Architecture

### 10.1 Monorepo Structure

```text
monodocs/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  README.md
  ROADMAP.md

  packages/
    core/
      src/
        build.ts
        config.ts
        scan.ts
        types.ts

        sources/
          detectFormat.ts

          markdown/
            renderer.ts
            extractMeta.ts
            render.ts
            links.ts

          asciidoc/
            renderer.ts
            extractMeta.ts
            render.ts
            links.ts

        pipeline/
          buildPages.ts
          buildSidebar.ts
          rewriteLinks.ts
          embedAssets.ts
          processMermaid.ts
          buildSearchIndex.ts
          renderSingleHtml.ts
          renderPdf.ts

    cli/
      src/
        index.ts

    vscode-extension/
      src/
        extension.ts
        previewPanel.ts

    themes/
      default/
        template.html
        style.css
        app.ts

  examples/
    basic-markdown/
    basic-asciidoc/
    mixed/

  tests/
    fixtures/
```

### 10.2 core

The heart of the conversion processing.

Responsibilities:

- Load configuration
- Scan files
- Determine input format
- Process Markdown
- Process AsciiDoc
- Generate the common Page model
- Generate the sidebar
- Convert links
- Embed images
- Process Mermaid
- Generate the search index
- Output HTML
- Output PDF

### 10.3 cli

The CLI interface.

Responsibilities:

- Parse command-line arguments
- Call core
- Display errors
- Start watch / serve

### 10.4 vscode-extension

The VS Code extension.

Responsibilities:

- Register VS Code commands
- Obtain workspace configuration
- Call core
- Webview preview
- Automatic rebuild

### 10.5 themes

Manages the HTML template, CSS, and client-side JS.

---

## 11. Source Renderer Architecture

To handle Markdown / AsciiDoc / other formats in the future, the Source Renderer approach is adopted.

### 11.1 SourceRenderer

```ts
export interface SourceRenderer {
  format: SourceFormat;
  extensions: string[];

  extractMeta(source: SourceFile): Promise<PageMeta>;
  render(source: SourceFile, context: RenderContext): Promise<RenderedContent>;
  extractLinks?(source: SourceFile): Promise<LinkRef[]>;
}
```

### 11.2 SourceFormat

```ts
export type SourceFormat = "markdown" | "asciidoc";
```

In the future, the following can also be added.

```ts
export type SourceFormat = "markdown" | "asciidoc" | "html" | "rst";
```

### 11.3 SourceFile

```ts
export type SourceFile = {
  absolutePath: string;
  relativePath: string;
  raw: string;
  format: SourceFormat;
};
```

### 11.4 Page

```ts
export type Page = {
  id: string;
  route: string;
  sourcePath: string;
  relativePath: string;
  format: SourceFormat;

  title: string;
  order?: number;
  hidden?: boolean;
  description?: string;

  rawSource: string;
  html: string;
  text: string;

  headings: Heading[];
  links: LinkRef[];
  assets: AssetRef[];
};
```

### 11.5 Heading

```ts
export type Heading = {
  level: number;
  id: string;
  text: string;
};
```

### 11.6 SidebarNode

```ts
export type SidebarNode =
  | {
      type: "dir";
      title: string;
      path: string;
      children: SidebarNode[];
    }
  | {
      type: "page";
      title: string;
      route: string;
      pageId: string;
    };
```

---

## 12. Configuration File

Configuration file name:

```text
monodocs.config.yml
```

`monodocs.config.yml` is the standard.

### 12.1 Configuration Example

This example is the configuration **as the current release accepts it**, with every key at its default.
A key specified in this document but not yet implemented does not appear here; it appears in the section
that specifies it, marked with the version that introduces it.

```yaml
title: "Internal Documentation"

# Language of the generated document: fills <html lang> and selects the UI label table (v0.10).
# Any BCP 47 tag; label tables ship for "en" (default) and "ja", and anything else falls back to the
# "en" labels with a warning. This is not the language of the CLI's own messages (25.6).
lang: "en"

# What to do when the machine running the build lacks a font the document needs (v0.10):
# warn / error / off. Top-level because it covers PDF output and mermaid pre-render alike (24.3.3).
fontCheck: "warn"

# What the document says about itself (v0.11). Every field is optional and none is interpreted:
# the date is not parsed and the version is not compared to anything (13.5). Unset by default.
# document:
#   version: "1.2"
#   date: "2026-08-22"
#   authors:
#     - "Documentation Team"

input: "./docs"

# The directory every relative path resolves against (v0.12). Defaults to input's value, so a
# configuration without it keeps its meaning. Written together with input, the two must name the
# same directory; a document spanning more than one selects with sources.include (12.5).
# root: "."

output:
  format: "html"
  path: "./dist/docs.html"

sources:
  # GitHub Flavored Markdown and frontmatter are always on; there is no key to turn either off.
  markdown:
    extensions:
      - ".md"
      - ".markdown"
  # Asciidoctor runs in safe mode with the input file's directory as its base. Neither is
  # configurable (17.5).
  asciidoc:
    extensions:
      - ".adoc"
      - ".asciidoc"
      - ".asc"
    # Asciidoctor attributes set as defaults rather than locks, so a document that sets its own
    # wins (v0.12). Attributes that move where files are read from, and the sandbox itself, are
    # refused naming the attribute and the reason (17.5).
    # attributes:
    #   sectnums: true
    #   product: "Widget"
  # Globs relative to root selecting what may become a page (v0.12). Absent, everything under root
  # is a candidate. exclude subtracts from this, and subtracts last (12.5).
  # include:
  #   - "README.md"
  #   - "docs/**"
  # Patterns that never become pages, added to the built-in list rather than replacing it (12.3).
  # exclude:
  #   - "drafts/**"
  # Whether the built-in list ("_partials/**", "partials/**", "includes/**", "**/_*") applies.
  excludeDefaults: true

sidebar:
  mode: "folder"
  # Source for obtaining titles. "heading" (default) = frontmatter → heading (H1 / = Title) → filename.
  # "filename" = use the filename as the title even if there is a heading (an explicit title always takes top priority).
  titleFrom: "heading"
  # Collapse directories deeper than this level by default (it only folds them without hiding, so reachability is not lost).
  # 0 = fold all directories / unspecified = no collapsing (fully expanded). The top level is depth 1.
  # collapseDepth: 2
  # Pull a directory holding exactly one page and no subfolders up to its parent.
  flattenSingleChild: false
  # Display-title transformation for anything other than explicit titles (frontmatter title / :sd-title:).
  # page applies to page display titles derived from headings/filenames, directory applies to folder display names.
  # type: none (default) / stripNumberPrefix / regex. route/page id are unchanged.
  titleTransform:
    page:
      type: "none"
      # type: "regex"
      # pattern: "^REQ-\\d+:\\s*"
      # replacement: ""
      # flags: "gi"
    directory:
      type: "none"
      # type: "stripNumberPrefix"

toc:
  # The deepest heading level shown in the in-page table of contents (2–6). Default is 3 (h2–h3).
  # h1 is always excluded because it corresponds to the page title. Headings themselves are always shown in the body.
  maxLevel: 3

assets:
  embedImages: true
  maxInlineSize: "5MB"
  onLargeImage: "warn"

mermaid:
  enabled: true
  mode: "client"
  # client mode only: inline (default, self-contained) / cdn (small file, needs the network).
  runtime: "inline"

highlight:
  enabled: true

html:
  theme: "default"
  # Search and the dark-mode toggle are always present; neither has a key that removes it.
  # Colour scheme a document opens in: light (default) / dark / auto. A reader's own choice wins.
  colorScheme: "light"
  # Maximum width of the body area. e.g.: "860px" / "1100px" / "72rem" / full
  contentWidth: "860px"
  # Show the reader-facing standard/wide content toggle
  contentWidthToggle: true
  # Initial toggle state until the reader chooses: standard / wide
  contentWidthDefault: "standard"
  # Enlarge unlinked, non-decorative content images in a dialog
  imageLightbox: true
  # Show the generator name and version at the end of HTML and PDF output
  branding: true
  # Replaces individual UI labels on top of the table chosen by lang (v0.10).
  # An unknown key is rejected; the key set is part of the frozen configuration surface.
  labels:
    tocTitle: "On this page"

pdf:
  pageSize: "A4"
  margin:
    top: "20mm"
    right: "15mm"
    bottom: "20mm"
    left: "15mm"
  printBackground: true
  # How tightly the printed page is set (v0.10): relaxed / normal (default) / compact / tight, or an object
  # taking base plus any of fontSize / lineHeight / headingSpacing / tableCellPadding (24.6).
  density: "normal"
  # Start a new sheet before every heading down to this level (v0.11): false (default) or 2–6 (24.7).
  pageBreakLevel: false
  # Bookmark outline with the same folder → page structure as the HTML sidebar.
  bookmarks: true
  # Page numbers, on by default (v0.10). false removes the band; an HTML fragment replaces it, using
  # Chromium's own pageNumber / totalPages / title / date / url classes (24.5). There is no {{token}}
  # syntax: the fragment is handed to Chromium as written.
  footer: '<span class="pageNumber"></span> / <span class="totalPages"></span>'
  header: false
```

**This example is a test fixture (v0.11).** Until then it was prose, and it drifted: it carried
`sources.markdown.enabled`, `gfm`, `frontmatter`, `sources.asciidoc.enabled`, `safeMode`, `attributes`,
`sidebar.collapsible`, `html.selfContained`, `routeMode`, `darkMode`, `pdf.enabled`, and
`search.enabled` — twelve keys the schema does not have. Since 12.2 made every object strict, this
document's own example had stopped being a configuration monodocs would load: copying it produced
`Unrecognized key`. The fix that holds is not a careful re-read but a test that extracts this block
and runs it through `loadConfig`, so the example cannot describe a tool that does not exist.

### 12.2 Unknown Keys (v0.10)

Every object in the schema refuses a key it does not know, the top level included. Until v0.10 only
some of them did — `sidebar`, `pdf`, `html.labels` — so whether a misspelling was caught depended on
how deep it sat: `pdf.footr` failed the build while a top-level `langauge` was accepted and quietly
ignored.

Accepted-and-ignored is the worse half of that pair. A rejected key is a build that stops and names
the problem; an ignored one is a configuration that looks right, and only the output says otherwise.
It is how a document was published declaring the wrong language with a `lang:` line sitting in the
file looking correct — the key was read, validated, and dropped on the floor. One rule for the whole
file replaces "it depends where you wrote it".

The error names the key and the object that holds it, `pdf: Unrecognized key: "footr"`, rather than
reproducing Zod's issue array as JSON. Making the top level strict breaks a configuration that
carries a key ahead of the release introducing it; taken before 1.0 rather than after.

### 12.3 What Never Becomes a Page (v0.10)

`sources.exclude` lists glob patterns, matched against the path relative to the input directory,
whose matches are not turned into pages. It is **added** to the built-in list
(`_partials/**`, `partials/**`, `includes/**`, `**/_*`) rather than replacing it.

Replacing was the earlier behaviour and it failed silently, at a distance. The built-in list exists
because those paths hold include fragments rather than pages; writing one unrelated pattern to keep a
draft out also switched that protection off, and what the author saw was fragments appearing in the
sidebar some commits later, with nothing connecting the two. A list that adds cannot do that.
`sources.excludeDefaults: false` is the way out for a tree that really does bundle its `_`-prefixed
files, and it says so where anyone reading the configuration can see it.

The key also moved. It was `sidebar.exclude`, but it was never a sidebar setting: a match never
becomes a page at all, so it leaves the bundle rather than the navigation. `sidebar.exclude` is still
honoured, merged the same way, and warns that it moved. A file named directly on the command line is
bundled whatever the patterns say (25.2) — naming a file is a choice, and the patterns only decide
what a directory scan picks up.

### 12.4 What 1.0 Freezes (v0.11)

"1.0 freezes the user-visible surfaces" has been the reason given for doing a dozen things before
1.0 rather than after. It was never written down, and read literally it says nothing may be added
afterwards — which would make 1.0 the last release that can grow, and would push every idea in this
document into a milestone before it. That is not the intent, and the intent has to be written before
the number is claimed rather than discovered afterwards from what someone assumed.

What 1.0 promises:

- A configuration key, a CLI command or option, or a piece of markup that 1.0 accepts is not
  **removed, renamed, or given a different meaning** in any 1.x release
- A **default value** does not change in a minor release. A change of default is a major release,
  because it changes an existing document without the author touching anything
- A new optional key, a new command, a new option, and a piece of markup that no existing document
  could already contain **may be added in a minor release**. Additions are how 1.x continues; they
  cannot break a configuration that does not use them
- A machine-readable format — the diagnostics JSON (27.3) above all — carries its **own schema
  version**, and that version, not the monodocs version, is what a consumer pins

What 1.0 does not do:

- It does not introduce keys that are **accepted and ignored** ahead of the release that implements
  them. 12.2 chose the opposite rule for the whole file and gave the reason: a key that is read,
  validated, and dropped produces a configuration that looks right and an output that says otherwise
- It does not freeze a **warning's wording**. Messages are translated (25.6) and rewritten; a script
  that greps stderr is reading something this project never promised to hold still. The diagnostics
  JSON exists so that CI has something that is promised
- It does not promise **byte-identical output** across versions. The generated HTML carries a
  generator version, a Shiki release changes a class, a template gains an element. What it does
  promise is that **one input, one configuration, and one monodocs version produce the same HTML
  bytes**, which is what makes a committed artifact reviewable in a diff — and the reason the build
  embeds no timestamp of its own (13.5). The PDF is outside that promise, measured: Chromium writes
  its own creation and modification dates into the file, and monodocs neither adds a date nor
  removes Chromium's

**Deprecation has a shape.** `sidebar.exclude` moved to `sources.exclude` and still builds while
saying where it went (12.3), which is the pattern: the old spelling keeps working, warns, names its
replacement, and is removed no earlier than the next major release. Nothing is removed in a minor
release, and nothing is removed without having warned in a release before it.

### 12.5 The Input Root and What It Selects (v0.12)

`input` names one directory, or since v0.10 one file (25.2). A repository whose `README.md` sits at
its root and whose pages sit in `docs/` cannot be built as one document, and that arrangement is not
unusual — it is what most repositories look like.

The obvious fix is to let `input` take a list. It is the wrong one, and the reason is worth writing
down because the same reasoning applies whenever a tool's single root becomes several. One root
answers four questions at once: where `monodocs.config.yml` is looked for, what a route is relative
to, which directory an image may be read from (20.2), and where an AsciiDoc `include::` may reach
(17.3). With `["./README.md", "./docs"]` every one of those becomes ambiguous — `README.md` and
`docs/index.md` both want to be `/`, an image at `./assets/logo.png` is inside one root and outside
the other, and two files with the same basename produce the same page ID from different roots.

So the root stays single and the **selection** becomes configurable:

```yaml
root: "."
sources:
  include:
    - "README.md"
    - "docs/**"
```

`root` is the directory everything is relative to and defaults to `input`'s value, so every existing
configuration keeps its meaning: `input: ./docs` is `root: ./docs` with everything under it included.
`sources.include` is a list of globs relative to `root`; when it is absent, everything under `root`
is a candidate, which is today's behaviour. `sources.exclude` (12.3) still subtracts, and it
subtracts last, so a pattern that keeps drafts out is not undone by an include that happens to cover
them.

Routes come from the path relative to `root` unchanged, which means adding `README.md` to a `docs/`
tree changes the routes of every page in it — `docs/index.md` becomes `/docs/` rather than `/`. That
is a real cost and it is the honest one: the document now contains two trees, and pretending
otherwise would mean inventing a per-include route base, which is the multi-root ambiguity again
wearing a different name. `sidebar.mode: custom` (14.2) already orders such a document, and route
aliases (15.5) keep the old links working.

`input` is not renamed and not deprecated. It is what a single-directory document uses, and it is
the spelling in every existing configuration, the CLI argument, and every example in this
repository. `root` is what a document that spans more than one directory sets, and the two are the
same key seen from different distances — so writing both is allowed only when they name the same
directory, and anything else is a configuration error rather than a merge. That is stricter than
"outside `root` is an error", and deliberately: an `input` pointing at a subdirectory of `root` has
no meaning that is not either the include list written out longhand or a second root wearing a
disguise. The rule holds for the command line too, so `monodocs build ./docs` against a
configuration that sets `root: "."` stops rather than silently picking one. An `input` naming a file
is compared as the directory holding it, which is how it is already treated when a configuration
file is looked for (25.2).

**Written without `input`, `root` is what the build is pointed at.** Falling back to the default
`./docs` would make `root: "."` fail on a repository that has no such directory — the exact shape
this key exists for.

**A negated pattern is refused in both lists.** picomatch combines the patterns of an array with
OR, so `["docs/**", "!docs/drafts/**"]` matches everything — the second matches every path outside
`docs/drafts`, which is most of them — and the drafts stay in the bundle. The pruning is worse: it
reads a pattern's static prefix, and for `!foo/**` that prefix is `foo`, so the walk enters exactly
the directory the author meant to leave out and skips the ones they meant to keep. Two keys already
say both things, so a third way of saying one of them is refused rather than misread.

**`root` has to name a directory.** It is what routes, images, and `include::` resolve against, and
a file cannot be that. Unchecked it half works — a single page builds, and only a relative image
reveals that the base is a file — which is the accepted-and-ignored failure 12.2 exists to prevent.
A `root` that does not exist is left to the build, which reports it as missing; so is an `input`
that does not exist, because nothing can tell a missing file from a missing directory, and comparing
them would turn a missing file into an argument about roots.

**The built-in exclude patterns are anchored at the root**, which means moving the root moves what
they cover. `_partials/**` matches a directory at the top of the root, and `**/_*` matches a file
whose own name begins with `_`; under `root: "."` a `docs/_partials/` is therefore no longer matched
by the first, in the same way a nested `sub/_partials/` is not matched today. It is a consequence of
the root moving rather than a hole this key opens, and `sources.exclude` is where a document says
what it actually wants.

### 12.6 Soft Line Breaks (v0.13)

A newline inside a paragraph has three defensible renderings, and monodocs has only ever produced
one of them. CommonMark makes it a space, which is what monodocs does today. A renderer may make it
a `<br>` instead — GitHub does in an issue comment, and Typora, GitLab, and VS Code's preview each
offer it as a setting. And CSS Text says that between two East Asian characters it should disappear
entirely, so that a Japanese paragraph written one sentence per line reads as one paragraph. The
three are not degrees of one thing; they answer different questions, and which one an author wants
cannot be derived from the document.

```yaml
sources:
  lineBreak: "space" # space (default) / break / join
```

| Value             | A newline inside a paragraph                 | Markdown                           | AsciiDoc                                |
| ----------------- | -------------------------------------------- | ---------------------------------- | --------------------------------------- |
| `space` (default) | becomes a space                              | nothing is done                    | nothing is done                         |
| `break`           | becomes a `<br>`                             | the newline becomes a `break` node | `hardbreaks-option` is set as a default |
| `join`            | disappears between two East Asian characters | one shared helper                  | the same helper                         |

**The key sits under `sources` rather than under `sources.markdown`.** `join` is a rule about
characters and not about a syntax: AsciiDoc joins the lines of a paragraph exactly as CommonMark
does, so a key reaching only Markdown would leave half of a mixed document (6.3) reading differently
from the other half for a reason its author never chose. `sources.exclude` and
`sources.excludeDefaults` (12.3) already sit at that level for the same reason.

**The default stays `space`**, which is what every existing document is already built with. It
changes no output that exists today. It does not break a paragraph that was hard-wrapped at some
column, which `break` would turn into a stack of short lines — and the damage is asymmetric, since a
missing break is visible to the author who wanted it while an unwanted one appears throughout a
document that was fine. And it matches how GitHub renders a repository's own `.md` files, which
matters because the same file is read there and built here.

What does **not** count is conformance. CommonMark and GFM both permit a renderer to turn a soft
break into either a space or a line break, so `break` is not a departure from the GFM support 6.1
promises. The reason for the default is GitHub's rendering, not the specification.

**The rule `join` applies is not one the current specification mandates, and the engines disagree
about it.** CSS Text Level 3 §4.1.3 and CSS Text Level 4 both say that a collapsible segment break is
"either transformed into a space (U+0020) or removed depending on the context before and after the
break", and that "the rules for this operation are UA-defined in this level". The rule that removes
it between two characters of East Asian Width F, W, or H where neither is Hangul was normative in the
2013 Working Draft, and it is what web-platform-tests still asserts: of the 49
`segment-break-transformation-rules` tests, nine fail on Chrome 152 and on Safari 26.6 and none fail
on Firefox 154 (stable channels, checked 2026-08-31). Measured in the development image
(Chrome/151.0.7922.137, 16px body): `日` + newline + `本` is 35.59px wide against 32.02px for `日本`
— a 3.58px space — and the same 3.58px appears between `。` and `次`, between two full-width Latin
letters, and between two half-width katakana.

So `join` is monodocs choosing one of the two behaviours the specification leaves to the user agent,
and choosing it once at build time so that the answer stops depending on which engine opens the file.
That it is the behaviour Firefox implements and the tests assert is why it is worth choosing; that
nothing mandates it is why it is a value of a key rather than the default.

This is not hypothetical here. `examples/ja/search.md` is written one sentence per line, and the
Markdown pipeline emits that newline verbatim into the HTML, so the published Japanese sample — and
the PDF built from it, which is Chromium's by construction — carries a space between every pair of
sentences.

**`break` reaches AsciiDoc through an attribute, set as a default.** The attribute is
`hardbreaks-option`, with `hardbreaks` an accepted alias. 17.5 requires an attribute monodocs sets to
be a default the document can override rather than a lock, and the mechanism is measured rather than
assumed: with `@asciidoctor/core` 4.0.6, and re-measured unchanged on 4.0.11, an attribute passed
through the API as `""` survives a
document's own `:hardbreaks-option!:`, and the same attribute passed as `"@"` does not. The `@`
suffix is what 17.5's rule is made of, and this key is its first user.

The asymmetry that follows is recorded rather than hidden: an AsciiDoc document can turn `break` off
for itself and a Markdown document cannot. AsciiDoc has document attributes because AsciiDoc has
document attributes (17.5), and inventing a Markdown counterpart is the template language 17.5
already refused.

**`join` costs a table.** JavaScript's regular expressions expose `\p{Script=Han}` but not
`\p{East_Asian_Width=W}`, so the F/W/H ranges are generated from the Unicode data file into a source
table, with the Unicode version recorded and a test asserting the table still matches it. `pre` and
`code` are skipped: there `white-space: pre` makes the newline a line the author drew rather than a
segment break, and removing it would join two lines of a code sample.

**Both values run inside the renderers, before the page's text is collected.** `postprocessPages`
re-parses `page.html` but does not recompute `page.text`, which the renderer produced earlier, so a
shared post-processing step would leave the search index describing a document the HTML no longer is.
One helper called from two renderers keeps them in agreement and leaves the Source Renderer boundary
(Chapter 11) intact.

**What each value does to search.** `break` splits a text node, and the result list matches across
the split while the in-body highlighting of 22.5 works within one text node and cannot mark it — a
limitation an explicit `<br>` already has, at a frequency `break` raises sharply. `join` moves the
other way, and what it removes is not what the HTML shows: the HTML carries the newline, but
`hast-util-to-text` folds it to a space when the page's text is collected, so the index holds
`です。 次` and a query spanning the two sentences finds nothing. `join` removes the break before that
collection happens, and the same query matches.

**The default does not follow `lang`.** A document that declares Japanese is not a document whose
Markdown means something different; the same file would then produce different structure depending on
a display setting, and one document can hold both languages at once. `lang` selects labels and
`<html lang>` (23.4), not a parser.

**This does not gate 1.0.** It is an optional key whose default changes nothing, which 12.4 allows a
minor release to add. It is scheduled after v0.12 because `break`'s AsciiDoc half is the attribute
machinery 17.5 defines, and that has to exist first.
---

## 13. Metadata

### 13.1 Markdown

For Markdown, YAML frontmatter is used.

```md
---
title: Installation
order: 10
hidden: false
description: Installation instructions
---

# Installation
```

### 13.2 AsciiDoc

For AsciiDoc, document attributes are used.

```adoc
= Installation
:sd-title: Installation
:sd-order: 10
:sd-hidden: false
:sd-description: Installation instructions
```

`sd-` is the attribute namespace for `monodocs`.

### 13.3 Title Priority

Common priority order:

```text
1. Explicit metadata
   - Markdown: frontmatter.title
   - AsciiDoc: :sd-title:
2. Document title
   - Markdown: H1
   - AsciiDoc: = Title
3. Filename
```

Specifying `sidebar.titleFrom: "filename"` skips 2 (document title); if there is no explicit metadata,
the filename is used as the title (for workflows where you want to use the filename as the navigation name even if a heading appears in the body).
Explicit metadata (1) always takes top priority regardless of `titleFrom`.

### 13.4 order Priority

```text
1. Explicit order in the custom sidebar
2. Markdown frontmatter.order / AsciiDoc :sd-order:
3. Filename prefix
4. Filename order
```

### 13.5 Document Metadata (v0.11)

13.1 through 13.4 are a page's metadata. A document has its own, and monodocs has had exactly one
piece of it: `title`. A specification handed to someone carries a version and a date, and often the
people responsible for it; a reader holding `docs.html` six months later has no way to tell what it
is a version of, or when it was true.

```yaml
title: "Internal Documentation"
document:
  version: "1.2"
  date: "2026-08-22"
  authors:
    - "Documentation Team"
```

Every field is optional and every field is a string monodocs does not interpret — `date` is not
parsed into a calendar, and `version` is not compared to anything. The one thing done to the text is
trimming the space around it, so a value that is only whitespace counts as unset rather than as an
empty line in the footer. What they do is reach three
places: the PDF's document properties (24.3.2), where `setAuthor`, `setSubject`, and `setKeywords`
sit unused beside the `setTitle` already written; the branding footer at the end of the HTML and the
PDF (23.2), which today says only which version of monodocs built the file; and, when there is one,
the cover (24.8).

**The build does not stamp its own date.** The obvious version of this feature fills the footer with
the moment the build ran, and that is exactly what must not happen: it makes the same input produce
different bytes on every run, so a committed `docs.html` shows a diff whenever anyone rebuilds it,
and a reproducible build stops being reproducible for a line of text nobody asked for (12.4). A date
in the output is a date the author wrote. A CI job that wants the build date sets it — `document.date`
takes a value from the workflow like every other key — and then the date is a decision rather than
an accident.

`title` stays where it is rather than moving into `document`. It is in every existing configuration
and in every example, and moving it would buy consistency at the price of the one thing 12.4
promises not to do.

**Where each field lands.** The footer carries one line — `Version 1.2 · 2026-08-22 · Documentation
Team` — and the word in front of the version comes from the label table `lang` selects, so it follows
the document's language and `html.labels` can replace it. The PDF's properties take the authors as
`Author`, the version and the date as `Subject`, and both values as the author wrote them as
`Keywords`: a search over a folder of PDFs matches `1.2`, not `Version 1.2`. The footer element
survives `html.branding: false`, which removes monodocs' line and not the author's — the two are
separate claims that happened to share a footer.

**What reproducibility measured out to be.** The generated HTML is byte-identical across builds of
the same input, and a test asserts it. The PDF is not, and monodocs is not the reason: Chromium
writes its own `CreationDate` and `ModDate` into the file, inside a compressed stream, and monodocs
neither adds a date nor removes those. So 12.4's promise holds for the artifact it was written about
— a committed `docs.html` reviewable in a diff — and a PDF differing in a timestamp is recorded here
rather than discovered later.
---

## 14. Sidebar

### 14.1 Default

Generated automatically from the folder structure.

Input:

```text
docs/
  index.md
  setup/
    install.adoc
    config.md
  guide/
    usage.adoc
```

Example output:

```text
Home
setup
  Installation
  Configuration
guide
  Usage
```

### 14.2 Customization

Already supported (v0.8). The structure, order, and titles are taken from the configuration file
exactly as written.

```yaml
sidebar:
  mode: "custom"
  items:
    - title: "Home"
      path: "index.md"
    - title: "Setup"
      children:
        - path: "setup/install.adoc"
        - path: "setup/config.md"
```

Each entry holds either `path` (a page, given as the path relative to `input` including the
extension) or `children` (a group), never both. `title` is optional for a page — the page's own title
is used when omitted — and required for a group, which has nothing to derive it from. `mode: custom`
and `items` must be given together; either one alone is a configuration error, because a setting that
is silently ignored is worse than a rejected one.

The custom sidebar also defines the reading order, so previous/next navigation, the page order in a
PDF, and the initially shown page follow it. Pages that are not listed keep their routes and are
placed after the listed ones; the omission is reported as a warning rather than an error, because
leaving a draft out of navigation is a legitimate choice and the page stays reachable. A listed page
that is `hidden` is skipped with a warning so that `hidden` remains the single source of truth for
navigation, and a group whose pages all disappear is dropped instead of leaving an empty heading.
A path that does not exist is an error (chapter 27.1).

Because the structure and the titles are explicit in this mode, the folder-derived
`sidebar.titleTransform.directory` and `sidebar.flattenSingleChild` are not applied.
`collapseDepth`, `exclude`, `titleFrom`, and `titleTransform.page` are unaffected.

### 14.3 Exclusion

By default, the following are excluded from sidebar generation.

```text
_partials/**
partials/**
includes/**
**/_*.md
**/_*.adoc
```

This prevents AsciiDoc include files and Markdown partials from being turned into pages.

---

## 15. Routing

### 15.1 route Generation

Routes are generated from the relative path of the source file.

```text
docs/index.md              -> /
docs/setup/install.adoc    -> /setup/install
docs/setup/config.md       -> /setup/config
docs/guide/usage.adoc      -> /guide/usage
```

The extension is not included in the route.

### 15.2 hash route

For the single HTML, hash routes are used.

```text
docs.html#/
docs.html#/setup/install
docs.html#/setup/config
```

### 15.3 HTML Structure

```html
<main id="content">
  <article data-route="/" id="page-index">...</article>

  <article data-route="/setup/install" id="page-setup-install" hidden>
    ...
  </article>
</main>
```

### 15.4 Pseudo-page Switching

```js
function showPage(route) {
  document.querySelectorAll("[data-route]").forEach((el) => {
    el.hidden = el.dataset.route !== route;
  });
}
```

### 15.5 Route Aliases (v0.12)

A hash route is a link a reader can copy. That is the point of it — `docs.html#/setup/install` is
how one person tells another where to look, and in a document that travels as a single file it is
the only way, since there is no server to redirect and no page to leave a note on. It is also
therefore a link that outlives the file: it sits in a chat log, a ticket, another document. Renaming
`setup/install.md` breaks every one of them, silently, and the reader who follows one lands on a
document that looks fine and shows the wrong page.

```md
---
title: Installation
aliases:
  - /setup/install
  - /getting-started/install
---
```

```adoc
= Installation
:sd-aliases: /setup/install, /getting-started/install
```

An alias is an old route that now resolves to this page. The table travels in `siteDataJson`, and
the client consults it when a hash matches no page: it replaces the hash with the current route and
renders the page, so the address bar ends up holding the link that will still work next time. A
route with an anchor (`#/setup/install#configuration`) keeps the anchor across the substitution,
because the anchor belongs to the heading rather than to the path.

The rules are the ones any redirect table needs, and they are checked at build time rather than
discovered by a reader:

- An alias is matched after every real route, so an alias can never shadow a page. A page that
  arrives later at a route some other page claims as an alias wins, and the alias warns that it has
  been shadowed rather than silently taking precedence
- Two pages claiming the same alias is an error, like two pages claiming the same route (27.1). One
  of them would win by scan order, which is not something an author can reason about
- An alias is normalised the way a route is — leading slash, no extension, `index` meaning the
  directory — so `setup/install.md`, `/setup/install`, and `setup/install` are one alias, not three
- An alias does not appear in the sidebar, the search index, or the previous/next order. It is not a
  page; it is a name a page answers to

**No alias is generated automatically.** monodocs could record every route a file has ever had by
reading the repository's history, and a document's link table would then depend on which clone built
it — a shallow checkout in CI produces a different file from a full one. An alias is a line the
author wrote.
---

## 16. Markdown Processing

### 16.1 Markdown renderer

Markdown uses unified / remark / rehype.

Main processing:

- Extract frontmatter
- Extract H1
- Convert GFM
- Convert to HTML
- Convert code blocks
- Extract images
- Extract links
- Assign heading IDs

### 16.2 Mermaid

For Markdown, a fenced code block is used.

````md
```mermaid
graph TD
  A --> B
```
````

This is converted into the following.

```text
<pre class="mermaid">
graph TD
  A --> B
</pre>
```

---

## 17. AsciiDoc Processing

### 17.1 AsciiDoc renderer

AsciiDoc uses Asciidoctor.js.

Main processing:

- Extract document title
- Extract attributes
- Convert to HTML
- Extract section headings
- Extract xref
- Extract image macro
- Extract source block

### 17.2 AsciiDoc Mermaid

For AsciiDoc, the following notation is treated as Mermaid.

```adoc
[source,mermaid]
----
graph TD
  A --> B
----
```

In the initial implementation, the output HTML of Asciidoctor.js is post-processed to convert it into a Mermaid block.

In the future, it may be implemented as an Asciidoctor.js extension.

### 17.3 include

AsciiDoc's `include::[]` is left to Asciidoctor.js.

However, to prevent include files from appearing in the sidebar as standalone pages, the following rules are established.

```text
_partials/**
partials/**
includes/**
**/_*.adoc
```

### 17.4 xref

AsciiDoc xref is converted into a route within the single HTML.

Input:

```adoc
xref:../guide/usage.adoc[Usage]
```

Output:

```html
<a href="#/guide/usage">Usage</a>
```

### 17.5 Attributes and the Read Boundary (v0.12)

Asciidoctor is configured by attributes, and monodocs sets three: `safe: "safe"`, a `base_dir` of
the input file's own directory, and `showtitle`. An author cannot set any others through
monodocs — `:sectnums:` in the document works, but a document set that wants numbering has to repeat
it in every file, and a value shared across files has nowhere to live at all. This document has
promised `sources.asciidoc.attributes` since before 1.0 and never had it (12.1).

The naive form is a map handed to Asciidoctor. It cannot be that, for a reason that is not obvious
from the outside: attributes set through the API are **locked** — they override what the document
says rather than defaulting it — and some of them move the boundary monodocs relies on. `allow-uri-read`
lets `include::` fetch a URL, which turns a build into an HTTP client; `data-uri`, `imagesdir`, and
`backend` move where files are read from and what is produced. Safe mode does not stop the first of
these: it is exactly the attribute that safe mode consults, and setting it through the API is how it
is turned on.

So the key exists and its contents are classified rather than passed through:

- **Allowed**, and settable per build: presentational and structural attributes such as `sectnums`,
  `sectnumlevels`, `experimental`, `idprefix`, `idseparator`, `tabsize`, `toclevels`
- **Author-defined**, for the values a document set shares — a product name, a release, a customer.
  These are the reason most authors want the key at all, and they are recognised by shape rather
  than enumerated: an attribute name that is not in the built-in vocabulary is the author's own
- **Refused**, naming the attribute and why: `allow-uri-read`, `docinfo`, `backend`, `data-uri`,
  `imagesdir`, `source-highlighter`, and the `sd-*` namespace (13.2), which belongs to monodocs.
  Refused rather than ignored, on 12.2's rule
- **Not configurable at all**: `safe` and `base_dir`. They are the sandbox, and a sandbox a
  configuration file can widen is a sandbox in name

An attribute set here is a **default**, not a lock, so a document that sets its own wins. That is
the opposite of Asciidoctor's API default and it is the behaviour an author expects from a
configuration file: the file states what every document gets unless it says otherwise. The mechanism
is Asciidoctor's own and it is measured rather than assumed: a value ending in `@` is soft-set, and
with `@asciidoctor/core` 4.0.6 — re-measured unchanged on 4.0.11 — an attribute passed as `""`
survives a document's own `:name!:` while
the same attribute passed as `"@"` does not (12.6).

**The name is validated before it is classified.** A denylist compared against the key as written
is not a denylist: Asciidoctor reads decoration on the key itself — `name@` is a soft set, and
`!name`, `name!`, `name!@`, `!name@` are unsets — and every one of those reaches the attribute under
its bare name. Measured: `allow-uri-read@` walked past a list containing `allow-uri-read`, and a
build fetched a URL over HTTP and put the response in the output, which is the one thing this
classification exists to prevent. A name must therefore be bare — lower-case letters, digits,
underscores, hyphens — and a decorated one is refused rather than stripped, because stripping would
mean deciding what the decoration meant, and the answer is always something this key does not offer.

**`outfilesuffix` and `relfilesuffix` join the not-configurable set.** They decide what Asciidoctor
puts on the end of a cross-reference, and the link rewriting matches a known set of extensions to
turn `xref:b.adoc[]` into a hash route. Measured: `outfilesuffix: ".xyz"` leaves a literal
`href="b.xyz"` in the single HTML — a dead link inside a document that is supposed to be
self-contained — and `validate` reports nothing, because nothing about it looks like a broken link.

**Three additions to the classification, from implementing it.** `showtitle` joins the
not-configurable set: monodocs sets it, and turning it off removes the `h1` that the page title, the
heading list, and every element ID are built from. `docdir`, `docfile`, `docname`, `docfilesuffix`,
and `outdir` join it too, for the reason `base_dir` is there — they are what Asciidoctor sets from
the file it is reading, so setting them from outside moves where a path resolves. And the key does
not offer **unsetting**: a value of `false`, or a name ending in `!`, is refused, because a
configuration file states what every document gets unless it says otherwise, and a document unsets an
attribute for itself with `:name!:`. A value already ending in `@` is refused as well, since that is
the marker monodocs adds to every value here and writing one would say it twice.

**What safe mode does and does not do.** Asciidoctor's SAFE mode confines `include::` to the base
directory, and monodocs relies on that (17.3). It does not resolve symbolic links, which Asciidoctor
documents: a link inside the tree pointing outside it is followed. Measured, and worse than the claim
suggests — a symlinked file and a symlinked directory both pulled content from outside the jail into
the output, while `../` and an absolute path were **recovered** into the jail rather than refused —
what a reader sees when nothing is at the recovered path is Asciidoctor's own "Unresolved directive",
which is easy to mistake for a refusal and was. The architecture document's claim that
safe mode "prevents external access" is therefore too strong. v0.12 makes it true instead of
softening it — an included file's real path is checked against the input root, and one that resolves
outside it is refused with the path it resolved to. The same check covers images (20.2), where the
identical hole exists.

**The check asks Asciidoctor rather than reading the text.** An include processor's `handles` is
called with the document and the **expanded** target for every include about to be read, and
returning `false` declines it and leaves Asciidoctor to do the include — so `lines`, `tag`, `tags`,
and everything else 17.3 promises are untouched. Only a target whose real path lands outside the
root is stopped, by throwing.

A first attempt scanned the source text instead, on the belief that a processor had no route from
the document to the reader. That was wrong, and wrong for a small reason: `doc.getReader()` returns
the `PreprocessorReader` and `reader.getCursor().getDirectory()` is the directory the include
resolves against, correct at each level of nesting — but `getDirectory` sits on the cursor rather
than on the reader, and a missing method was read as a missing route. The scan that followed had to
decide what a `////` line meant, whether a directive could sit anywhere but the start of a line, and
whether `]` could appear in a target, and it was wrong about all three in the permissive direction:
outside content reached the output through each. Over-approximating closed those and cost false
refusals — an include inside a comment block or a false `ifdef` — and still could not resolve a
target built from an attribute reference. Asking Asciidoctor has none of those problems, because it
is asked exactly when an include is about to happen.

**The path is resolved by Asciidoctor too, not just the target read from it.** Safe mode does not
refuse a target that climbs out of the jail — it **recovers** it by dropping the `..` and reads the
recovered path. Measured, `include::../x.adoc[]` from a jail of `root/docs` resolves to
`root/docs/x.adoc`, not to `root/x.adoc`, so resolving the target the plain way looked at a path that
does not exist, skipped it, and let a symbolic link out of the tree be read. `normalizeSystemPath` is
the call Asciidoctor itself makes, so there is nothing left to diverge — and the same fix removes the
false refusal the divergence caused in the other direction, where a recovered path that stayed inside
the root was rejected.

A lexical escape is therefore not an escape: safe mode recovers it into the jail, and what the reader
sees is Asciidoctor's own "Unresolved directive" when nothing is there.

**What the check assumes, stated precisely.** It sees the path Asciidoctor's own include handling
would read. Another include processor can change that in two ways, and both are outside what this
boundary can see: one whose `handles` returns true **before** it takes the include, and one that
returns true **after** it and then pushes the contents of a different file. So the assumption is not
"no preferred processor" but the wider "no other include processor either preempts this one or reads
somewhere other than the target it was asked about".

monodocs registers no other processor, so its own CLI, `watch`, and `serve` are unaffected. The case
where it matters is a program embedding `@monodocs/core` in a process that registers global
Asciidoctor extensions. The boundary calls `prefer()`, which places it ahead of anything registered
normally — measured, it is already ahead of those, since it is registered on the registry directly
and global extensions are activated afterwards; what `prefer()` actually buys is being ahead of
another `prefer()`ing processor activated before it, and the last one activated still wins.

**Markdown gets no equivalent.** A `vars:` map substituted into Markdown text is a template language:
it needs an escape for the literal spelling, a rule for an undefined name, a rule for code blocks
and for `<pre>`, and a decision about recursion — and every one of those is a specification and a
test. AsciiDoc has attributes because AsciiDoc has attributes; Markdown does not, and monodocs is
not the place to invent them. A document set that needs shared values is a document set that can
write its shared pages in AsciiDoc, which is what mixing formats (6.3) is for.
---

## 18. Link Conversion

### 18.1 Basic Policy

Regardless of Markdown / AsciiDoc, links in the final HTML are converted into routes.

Targets:

- Markdown `.md` links
- Markdown `.adoc` links
- AsciiDoc `xref:`
- `.html`-equivalent links in the HTML converted from AsciiDoc
- image links

### 18.2 Markdown Example

Input:

```md
[Configuration](./config.md)
[Installation](./install.adoc)
```

Output:

```html
<a href="#/setup/config">Configuration</a>
<a href="#/setup/install">Installation</a>
```

### 18.3 AsciiDoc Example

Input:

```adoc
xref:config.md[Configuration]
xref:install.adoc[Installation]
```

Output:

```html
<a href="#/setup/config">Configuration</a>
<a href="#/setup/install">Installation</a>
```

### 18.4 Heading Links

Already supported. Heading links were resolved to the file level at first, and now resolve down to
the anchor.

Example:

```md
[Authentication Settings](./config.md#authentication-settings)
```

Output:

```html
<a href="#setup-config-authentication-settings">Authentication Settings</a>
```

Of the two candidates originally listed, the element ID (the second one) was adopted over
`#/route?heading=…`. Element IDs are already unified as `{page-id}-{original-ID}` (Chapter 19), the
theme's router already routes a hash that does not start with `/` to the page containing that element,
and Chromium turns the same href into a working internal link in the PDF, where all pages are expanded.
The `?heading=` form would have required extending the route syntax and the router for no added
capability.

Because the anchor is matched against the ID the target file generates, a Markdown link to an AsciiDoc
heading has to use the ID Asciidoctor produces (for example `_details`). An anchor that does not exist
in the target page falls back to the top of that page and is reported as a warning
(`validate` surfaces it).

---

## 19. Heading IDs

Because multiple files are placed into a single HTML, avoiding heading ID collisions is essential.

Bad example:

```html
<h2 id="overview">Overview</h2>
<h2 id="overview">Overview</h2>
```

Good example:

```html
<h2 id="setup-install-overview">Overview</h2>
<h2 id="guide-usage-overview">Overview</h2>
```

ID generation rule:

```text
{page-id}-{slugified-heading}
```

Example:

```text
setup/install.md + ## Overview
-> setup-install-overview
```

Heading IDs originating from AsciiDoc are also prefixed in the same way to avoid collisions.

### 19.1 Section Numbering (v0.14)

A specification refers to itself. "See 3.2" is how a clause points at another clause, and it is what
a reviewer writes in a comment and what a regulation cites from outside. monodocs can produce no
such number. AsciiDoc's `:sectnums:` numbers one file's sections and restarts in the next, which in
a bundle of files is not a numbering but a set of them; Markdown has nothing at all, so a mixed
document could not agree with itself even if each half were numbered.

Numbering therefore belongs where the two formats have already been made one — the `Page[]` model
after rendering, not either renderer:

```yaml
numbering:
  sections: 3 # false (default), or the deepest heading level numbered (2–6)
```

The document's structure decides the numbers. The first-level number comes from the page's position
in the sidebar order (14.1), which is the order the reader moves through the document, so a page is
a chapter and its `h2`s are `1.1`, `1.2`, and so on. A directory that holds pages contributes its
own level, so `guide/usage.md` under a numbered `guide/` is `2.3` rather than restarting. `h1` is
not numbered as a heading — it is the page title, and the page's own number is what precedes it.

Where a number appears is a decision per surface, not one switch:

- **In the heading**, in a `<span>` of its own, so a stylesheet can suppress it and so copying a
  heading copies the number with it
- **In the sidebar and the in-page table of contents**, because a table of contents whose numbers
  disagree with the body is worse than one with no numbers
- **In the search index**, not as a separate token: a reader searching `3.2` is looking for a
  section, and a reader searching `usage` should not be outscored by digits
- **Not in the route, the page ID, or the heading ID.** Those are addresses (15.1, 19), and an
  address that changes when a page is reordered breaks every link that was ever copied — the exact
  failure 15.5 exists to prevent. A number is a label

**`:sectnums:` in a document is refused** once numbering is on, naming the configuration key,
because two numbering schemes over one document produce two different numbers for the same heading
and no way to tell which one a cross-reference meant.

This is the smallest of the printed-document features and the one the others lean on: 24.9's table
of contents lists numbered sections, and a cross-reference that says "3.2" is only useful in a
document where 3.2 is written on the page.
---

## 20. Image Embedding

### 20.1 Supported Formats

```text
png
jpg
jpeg
gif
svg
webp
```

### 20.2 Markdown

Input:

```md
![Architecture diagram](./images/architecture.png)
```

Output:

```html
<img src="data:image/png;base64,..." alt="Architecture diagram" />
```

### 20.3 AsciiDoc

Input:

```adoc
image::images/architecture.png[Architecture diagram]
```

Output:

```html
<img src="data:image/png;base64,..." alt="Architecture diagram" />
```

### 20.4 Size Limits

Configuration example:

```yaml
assets:
  embedImages: true
  maxInlineSize: "5MB"
  onLargeImage: "warn"
```

Candidates for `onLargeImage`:

```text
warn
error
external
```

### 20.5 Output Size (v0.13)

33.3 records the risk that the single HTML becomes huge, and monodocs has one control for it —
`maxInlineSize` and `onLargeImage`, which judge one image at a time. Nothing measures the file. A
build prints the number of pages and where it wrote them, so the author who has just embedded
fourteen screenshots learns the result from an email bouncing.

```text
docs.html  8.4 MB
  images        7.9 MB  (12 files, largest: guide/setup.png 2.1 MB)
  mermaid       0.9 MB  (inline runtime)
  page data     0.4 MB  (siteDataJson: text, headings, search)
  document      0.2 MB
```

The breakdown is what can be measured honestly rather than a full accounting: the embedded images,
the Mermaid runtime when `mermaid.runtime: inline` put it there (21.1), the `siteDataJson` payload
that carries the searchable text, and everything else as one line. Shiki does not appear, because it
has no runtime in the output — highlighting happens at build time and leaves spans in the body,
which are part of the document.

```yaml
assets:
  budget: "10MB" # unset by default; warn when the output exceeds it
  onBudget: "warn" # warn / error
```

A budget is what makes the measurement act. `warn` is the default so that adding the key cannot
break a build that was already over; `error` is for the CI job of a document that has to fit an
email attachment or a wiki upload limit, which is a real constraint and one that is invisible until
it is breached.

**Images are not re-encoded, and this is a decision rather than an omission.** Downscaling a 4 MB
screenshot to 200 KB is the largest single saving available here, and monodocs will not do it:

- The libraries that do it well are native (`sharp`/libvips). The published CLI is a single CJS
  bundle and a SEA binary (8.5), and neither takes a native addon — the feature would exist in one
  distribution and not the other, which is the split PDF output already has and does not need a
  second of
- Doing it in the browser instead would make an HTML-only build require Chromium, which is today the
  line between what the binary can do and what it cannot
- An encoder's output depends on its version and its platform, so the same input would stop
  producing the same bytes on a different machine — the reproducibility 12.4 promises, spent on
  convenience
- Quality, colour space, EXIF orientation, animation, and SVG each need a rule, and a wrong one
  silently degrades the author's picture

`onLargeImage: external` remains the answer for a document whose images are genuinely too big: the
image stays a file beside the HTML, which is a document that is no longer single-file and says so.
An author who wants smaller images has tools that specialise in exactly that, and running one is a
step in their build rather than a promise in this one.
---

## 21. Mermaid

### 21.1 client mode

The initial implementation adopts client mode.

```yaml
mermaid:
  enabled: true
  mode: "client"
```

Mermaid.js is included in the HTML and rendered on the browser side.

Advantages:

- Simple to implement
- Does not depend on Mermaid CLI / Chromium
- Easy to handle even in the VS Code preview

Disadvantages:

- JavaScript is required
- When converting to PDF, waiting for rendering completion is required
- HTML size increases

### 21.2 pre-render mode

Already supported.

```yaml
mermaid:
  enabled: true
  mode: "pre-render"
```

At build time, each diagram is converted to SVG using Puppeteer (`puppeteer-core` + system Chromium) and embedded into the HTML
(instead of the originally proposed Mermaid CLI, the policy was changed to run `mermaid.render` for the existing dependency mermaid@11 within a single page and control id collisions
by ourselves). The implementation is `processMermaidPrerender` in `pipeline/mermaidPrerender.ts` and `postprocess.ts`.
The SVG is inserted as a raw node, and ids are assigned as `mermaid-{n}`, unique across the entire HTML.

Advantages:

- Strong for PDF conversion
- Can be displayed even without JavaScript
- Printed results are stable
- If there are few diagrams, it is smaller than the inline runtime (fixed at approximately 975KB gzip)

Disadvantages:

- Heavy dependency (Chromium). Not usable in the bundled CLI (single `.cjs` / single executable file)
- Increases failure factors in CI environments
- SVG themes are fixed at build time (they do not follow dark/light toggling)

---

## 22. Search

### 22.1 Initial Implementation

Simple partial-match search.

Search-related client data example:

```js
window.__MONODOCS_DATA__ = {
  title: "Manual",
  initialRoute: "/setup/install",
  colorScheme: "light",
  // Deepest level shown in the in-page table of contents. pages[].headings carries
  // every h2+ heading so that search can jump to any of them.
  tocMaxLevel: 3,
  pages: [
    {
      route: "/setup/install",
      title: "Installation",
      hidden: false,
      headings: [
        {
          id: "setup-install-prerequisites",
          text: "Prerequisites",
          level: 2,
        },
      ],
      text: "How to install...",
    },
  ],
};
```

Search targets:

- title
- headings
- plain text

### 22.2 Scoring and Multiple Keywords

Already supported (v0.8). The search stays inside the theme's `app.js` with no added dependency:
`minisearch` (the original candidate) would ship an index plus a runtime inside every generated
document for gains that partial matching already covers, and monodocs bundles everything into one
self-contained file.

The query is split on whitespace (the ideographic space included) into keywords, and a page is a hit
only when **every** keyword appears in one of its fields (AND). Each keyword scores per field, so
title hits outrank heading hits and heading hits outrank body hits. Repeated body occurrences add a
capped bonus, and a query whose keywords appear in that order as a phrase gets an extra bonus (the whitespace between them may be of any kind or length). Ties
keep document order.

```text
per keyword: title 100   heading 30   body 10 (+1 per extra occurrence, up to +5)
phrase (highest applicable one only): title +40 / heading +20 / body +10
```

Keywords are matched after folding both sides to lowercase and mapping full-width alphanumerics
(`ＰＤＦ`) to their half-width form. Folding preserves string length so highlight positions stay valid; NFKC is
not used because it can change length. Japanese needs no word segmentation because matching is
substring-based; a space-separated query works the same way as in English.

A result that matched a heading links to that heading's element ID rather than the page top (the same
mechanism as cross-file heading anchors, chapter 18.4), and shows the heading under the page title.
Because search reaches any heading, the client receives every `h2`+ heading and narrows the in-page
table of contents to `toc.maxLevel` itself.

Keywords are highlighted with `<mark>` in the title, the heading, and the snippet. The snippet is the
window of the body that contains the most distinct keywords. The same keywords are highlighted in the
body of the page a result opens (22.5).

### 22.3 Kana and Symbol Folding

Already supported (v0.9). `fold` additionally maps katakana to hiragana and collapses the characters
that Japanese text writes interchangeably, so a reader who types one spelling finds the other:

- Katakana → hiragana. U+30A1–U+30F6 correspond one to one with U+3041–U+3096, which covers the
  voiced forms (`ガ` → `が`) as well as `ヴ` / `ヵ` / `ヶ`. `ヷ`–`ヺ` have no hiragana counterpart and
  are left alone.
- The prolonged sound mark `ー`, the dash family (U+2010–U+2015, U+2212), and the full-width hyphen
  all fold to `-`; the wave dash `〜` and the full-width tilde `～` both fold to `~`. These are written
  interchangeably in the same position, and the wave dash pair in particular swaps depending on the
  authoring platform.

Every mapping is one character to one character, which preserves the length invariant that the
highlight and snippet offsets depend on (22.2).

Three related variations stay out of scope, because each one breaks that invariant:

- **Half-width katakana** (`ｶﾞ` → `ガ`) composes two characters into one, so the folded string would
  stop sharing offsets with the original.
- **Okurigana variants** (`引き渡し` / `引渡し`) cannot be derived from the characters at all. They
  need a morphological analyzer whose dictionary runs to several megabytes — inside every generated
  document, for a tool whose purpose is one self-contained file.
- **English stemming** (`installing` → `install`) is small to implement, but it changes token length
  and needs the same position map as half-width katakana.

Supporting any of them means replacing the fold-in-place model with a token-to-source position map.
Revisit the three together if that rewrite ever becomes worthwhile; none of them justifies it alone.

### 22.4 Keyboard Navigation of the Results

Already supported (v0.9). The search box and its result list form an ARIA combobox: `↓` / `↑` move
the selection (wrapping at both ends), `Enter` opens it, and `Escape` clears the query as before.

Focus stays in the search box the whole time, and the selection is published through
`aria-activedescendant` instead. That is what lets a reader keep typing to narrow the results without
tabbing back, and it is why the selected result needs its own outline: the browser's focus ring is on
the input, not on the row being read out.

`Enter` with nothing selected opens the top result, which is what a reader who has just typed a query
means. `Home` / `End` are deliberately left to the text field for caret movement.

The handler returns immediately while an IME is composing (`isComposing`, with `keyCode === 229` as
the fallback for engines that do not set it). During composition the same keys belong to the IME —
the arrows move through conversion candidates and `Enter` commits one — so intercepting them breaks
Japanese input in the search box and can open a result for a half-composed query.

The option IDs are allocated against the IDs the document already contains, rather than assuming a
prefix is reserved. A page ID and a heading can combine into the same string (`monodocs-search.md`
with a heading `Option 0` produces `monodocs-search-option-0`), and a duplicate ID would send
`getElementById` to the result row instead of the heading, because the sidebar comes first in
document order. The page would then fail to switch when that anchor is followed.

Because the result list is a listbox, each `li` is `role="presentation"` and the link inside carries
`role="option"`; the links are taken out of the tab order (`tabindex="-1"`) so `Tab` still leaves the
search box in one step. Keyboard activation and mouse clicks run the same code path, and moving the
pointer over a row takes the selection with it, so the two ways of choosing a result cannot disagree.

The roles and ARIA attributes are attached from `app.js` rather than written into `template.html`, so
a custom theme that replaces the markup but keeps the default script still gets them.

### 22.5 In-Body Highlighting

Already supported (v0.9). Opening a result also marks its keywords in the page it opens, so what the
result list promised is visible where the reader lands, without a second search in the browser's own
find bar.

The highlight belongs to the search that opened the page. `app.js` remembers the keywords when a
result is activated and marks them in the article on display, and it marks them again whenever the
displayed page changes, so following prev/next or a link inside the body keeps the matches visible.
Editing the query drops the highlight, because the keywords being typed are no longer the ones the
open page was chosen for, and `Escape` clears the query and the highlight with it.

Where the result opens is unchanged: a heading match still opens at its heading, and a title or body
match still opens at the top of the page. The highlight only marks; it does not move the viewport.
Marks are `<mark class="search-hit">`, and only the background is styled, so no line breaks and no
scroll position shift when they appear. The class is for the colour only — what a mark is removed by
is a DOM property set on the elements the script creates. A document carries `<mark>` of its own
(AsciiDoc `#text#`) and can carry any class in raw HTML, and, as with the option IDs in 22.4, the
name is not assumed to be reserved: a property cannot be authored into the document, so content that
happens to use the class is left alone, and a keyword inside the document's own `<mark>` is marked
inside it rather than replacing it. Removing the highlight puts the text back and calls `normalize()`
on the parent, which restores the structure and the node count — not the identity of the original
text nodes — so marking and unmarking repeatedly does not shred the body into ever smaller nodes.

Matching reuses the folding and the merged match ranges of the result list (22.2, 22.3): a hiragana
query marks the katakana spelling in the body exactly as it does in the snippet. It runs per text
node, so a keyword that inline markup splits (`**inst**all`) still ranks the page — the index is
built from the whole page text — but is not marked in the body. Marking across element boundaries
needs the same source position map as the folding variants ruled out in 22.3, and it is left out for
the same reason.

Three kinds of subtree are left alone. A Mermaid block is source that the runtime reads and replaces
with a diagram, so marking it would break the diagram; `svg` is what that runtime leaves behind; and
the code-block toolbar and its copy toast are UI text the theme injects into the content rather than
the document's own words. The number of marks per page is capped (500) so that a keyword occurring
everywhere cannot turn one navigation into thousands of new elements. The cap also bounds the
matching: a single text node can be a whole paragraph or code block, so the match positions are
collected up to the cap instead of collecting every occurrence and discarding the surplus.

The CSS Custom Highlight API would avoid touching the DOM at all, but it is not used: it still needs
a fallback for the browsers a self-contained document is opened in, and that fallback is the `<mark>`
implementation anyway.

---

## 23. HTML Template

### 23.1 Basic Structure

```text
<!doctype html>
<html lang="{{lang}}">
  <head>
    <meta charset="utf-8" />
    <title>{{title}}</title>
    <style>
{{style}}
    </style>
  </head>
  <body>
    <div id="app">
      <aside id="sidebar">{{sidebar}}</aside>

      <main id="content">{{pages}}</main>
    </div>

    <script>
      window.__MONODOCS_DATA__ = {{siteDataJson}};
    </script>

    <script>
{{appJs}}
    </script>
  </body>
</html>
```

### 23.2 UI Elements

Initial:

- Left sidebar
- Body area
- Current page highlight
- Page switching via hash route

Future:

- Search box
- In-page table of contents
- Previous/next page navigation
- Dark mode
- Sidebar collapsing
- Print layout

---

### 23.3 Custom Themes

Already supported (v0.8). `html.theme` takes either a built-in theme name or a path to a directory,
resolved relative to the configuration file. A path is anything that starts with `.`, contains a
separator, or is absolute; everything else is a built-in name, and an unknown one is rejected with the
list of built-ins rather than a missing-file error.

A theme directory may hold `template.html`, `style.css`, and `app.js`, and **whatever it omits falls
back to the default theme**. This is the central decision: restyling is the common case, and requiring
a copy of `app.js` — which carries routing, search, the table of contents, prev/next navigation, dark
mode, code-block controls, and the image lightbox — would turn every release into a merge for someone
who only wanted different colors. A directory holding none of the three is rejected as a wrong path.

A custom `template.html` must keep `{{style}}`, `{{sidebar}}`, `{{pages}}`, `{{siteDataJson}}`,
`{{appJs}}`, and `{{bodyScripts}}`; the build fails naming the missing ones, because a document
without them cannot show its content, run its client, or receive the Mermaid runtime. The remaining
tokens and conditional blocks are optional and simply drop the feature they carry.

Themes are read from the filesystem, so they work in every distribution form including the standalone
binary, which only embeds the built-in theme. Resolution from `node_modules` is deliberately not
implemented: it would not work in the binary, and a theme published on npm can still be pointed at
through its path. `watch` / `serve` also watch the theme directory so that edits reach the preview.

Because the output is one self-contained file, a theme cannot reference external assets; fonts and
images belong in `style.css` as data URIs. A theme is executable code inside the document and carries
the same trust as the documentation sources (chapter 33 and the security notes in development.md).

### 23.4 Document Language and UI Labels (v0.10)

A generated document carries two languages that have no reason to agree: the language its pages are
written in, and the language of the chrome monodocs wraps around them — the sidebar search box, `On
this page`, `No results`, `Copy`, the lightbox controls, prev/next.

Until v0.10 neither was settled. `template.html` hardcoded `<html lang="ja">` while every label was
English, so the output was wrong for both audiences at once: a Japanese reader met `On this page`, and
a screen reader was told to pronounce English labels with a Japanese voice. Nothing in the
configuration could correct either half.

**This reverses a recorded decision.** architecture.md stated that theme UI labels are standardized in
English and independent of the body language. That was defensible while the labels were a fixed part
of the theme, but it was a description of the implementation rather than a choice made for the reader:
it leaves a Japanese document declaring `lang="ja"` and displaying English, which is the one
combination that serves nobody. The reversal is recorded in architecture.md rather than left as a
contradiction between two documents.

The top-level `lang` key fills `<html lang>` and selects the label table, and defaults to `en` —
matching the README, the documentation site, and the CLI messages (25.6) that this repository
publishes in English first. A Japanese document sets `lang: ja` and gets, for the first time, a
document whose declared language and whose labels are both Japanese. Anyone who relied on the old
hardcoded `ja` sees the attribute change; that is a breaking change, taken before 1.0 for the same
reason the `manual.html` rename was.

`lang` accepts any syntactically valid BCP 47 tag, because it is the document's language and
`<html lang>` must be able to say so; a string that is not one is rejected rather than written into the
attribute. Label tables ship for `en` and `ja` only. Tags are matched case-insensitively on the primary
language subtag, so `en-GB`, `ja-JP`, and `JA` all find one. A tag that has no primary language subtag
to match — a wholly private-use `x-…` tag, or a grandfathered tag — falls back to the `en` labels
alongside every other tag with no shipped table, and the fallback warns once per build, naming the tag.
Rejecting unknown tags instead would force a French document to misdeclare itself as English to build
at all, which is worse for its readers than English labels they can override.

`html.labels` replaces individual entries on top of the chosen table. It sits under `html` because it
acts on the theme's chrome, the same layer as `html.theme` and `html.imageLightbox`, while `lang`
describes the document itself alongside `title`. An unknown key is rejected so a typo does not
silently keep the default, which also means **the key set is public API frozen at 1.0**: it is
enumerated in the configuration reference rather than left to whatever the theme happens to read.

Shipping two tables and making the rest overridable is the smaller promise. A half-translated language
shipped in core is worse for its readers than no entry at all, and it is the maintainer, not its
speakers, who would have to keep it current.

Resolving a table against `lang` and applying `html.labels` over it happens in core, which makes core
the single source of truth for what a label says. The result is published in `{{siteDataJson}}`, a
token every custom template already has to keep. `app.js` consumes that instead of carrying its own
copy of the strings, so a table and an override cannot drift apart between the two.

**What a custom theme gets is bounded by the theme contract (23.3), and stating that bound precisely
matters more than stating a generous one.** Four different things are guaranteed to four different
degrees:

- **Every theme** gets the resolved labels as data in `{{siteDataJson}}`. This is the only unqualified
  guarantee, and it is the one monodocs can actually keep.
- **The default `app.js`** applies them to the DOM hooks the default template provides. A theme that
  replaces only `style.css` therefore behaves exactly as the built-in one does. A theme that replaces
  `template.html` gets them wherever it kept those hooks, and nowhere else — the script can only
  address structure it can find, so a template rewritten without them is not covered.
- **A theme replacing `app.js`** receives the data and applies it itself, exactly as it already takes
  over routing, search, and the table of contents. monodocs guarantees delivery, not application.
- **Static text a custom `template.html` spells out itself** stays as written. monodocs cannot know
  which strings in someone else's markup were meant to be labels. The default template takes its
  static labels from tokens, so a theme starting from a copy of it inherits the behaviour.

`{{lang}}` is added as an optional token rather than a required one; making it required would break
every theme that exists today for a feature they may not want, and a custom template that hardcodes
`<html lang="…">` keeps what it wrote.

A label is a value from the configuration file that ends up in HTML text, in attributes such as
`title` and `aria-label`, and in the JSON of `siteDataJson`. The three need different escaping, and
getting one wrong turns a configuration key into an injection point, so escaping is per destination
rather than once at the source.

`lang` describes the document, and is deliberately not the same setting as the language of the CLI's
own messages: a document is often written in one language by someone working in a terminal that
reports another, and a build log should not change language because the document did.

---

## 24. PDF Output

### 24.1 Basic Policy

The PDF is generated from the HTML.

```text
monodocs build
  ↓
single HTML
  ↓
Playwright
  ↓
PDF
```

### 24.2 Command Example

```bash
monodocs build ./docs --format pdf -o ./dist/docs.pdf
```

When outputting both HTML and PDF:

```bash
monodocs build ./docs --format both -o ./dist/
```

### 24.3 Notes

For PDF output, pay attention to the following.

- Waiting for rendering completion of Mermaid client mode
- Waiting for image loading completion
- Print CSS
- Page-break control
- Whether to include the sidebar
- Full-page output that does not depend on the URL hash

### 24.3.1 No Scrollbars on Paper (v0.8)

On screen, anything wider than the content column stays readable because it scrolls: code blocks and
tables have their own horizontal scrollbar, and the reader can pan the page. Paper has neither, so
Chromium simply cuts the overflow off and the content is missing from the PDF with nothing to
indicate it. Measured on A4 with the default margins (a 680 px content column), a `bash` command line
reached 728 px and a paragraph with a long URL reached 862 px — both lost their tails.

The print stylesheet therefore wraps instead of scrolling: `pre` becomes `pre-wrap` with
`overflow-wrap: anywhere`, tables drop back to `display: table` (the screen-side `display: block`
that makes them scrollable also disables `thead` repetition, so a table crossing a page break lost
its header row), cells break long words, and diagrams are capped at the page width. `overflow-wrap: break-word` on the content column covers long URLs in body text, on
screen as well — the same unbreakable strings were also what forced narrow screens to scroll
horizontally.

That reshaping first used `table-layout: fixed`, which turned out to be the wrong half of the fix
(v0.10). With no `<col>` widths to work from, fixed divides the width equally whatever the contents
are: a schedule of short dates against whole sentences came out 50/50, the date column half empty
and the sentences wrapping in a column narrower than they needed — in a document made largely of
tables, that is a real part of its page count. `auto` reaches the same guarantee by a different
route. The cells already carry `overflow-wrap: anywhere`, which gives every column a one-character
minimum width, so the auto algorithm can always fit the table into the page rather than overflow it.
No truncation, and each column is as wide as what is in it.

### 24.3.2 Document Information (v0.8)

A distributed PDF should say what produced it. Chromium leaves Creator as its own user-agent string
and pdf-lib, used for the bookmark pass, writes itself into Producer; neither mentions monodocs, and
the title stays empty so viewers show only the file name. `setPdfMetadata` sets the configured title
and `monodocs v<version>` for both Creator and Producer, after the bookmark pass and with pdf-lib's
`updateMetadata` disabled so that saving does not overwrite them again. It also raises the
`DisplayDocTitle` viewer preference, without which a standards-following viewer keeps showing the
file name even when a title is present.

### 24.3.3 Missing Fonts (v0.10)

An artifact is composed once, on the machine that runs the build, with the fonts that machine happens
to have — and a character with no font becomes tofu (□ / ☒), permanently, in every copy that is then
handed out. Japanese text needs a CJK font and emoji need an emoji font, and a CI runner cannot be
assumed to carry either.

HTML normally escapes this, because it is drawn with the reader's fonts. The exception is
`mermaid.mode: pre-render` (21.2), which measures and positions diagram text with the build machine's
fonts and bakes the result into the SVG; a missing font is baked in there too, in HTML as much as in
PDF. The check therefore belongs to the build rather than to PDF output alone, which is why its
setting is top-level `fontCheck` and not `pdf.fontCheck`.

The documentation already warns about both — the site's CI guide installs `fonts-noto-cjk` and
`fonts-noto-color-emoji` in its GitHub Actions and GitLab CI recipes, and the configuration page
carries the same caveat for `pre-render`. What was missing was any check in the code: skip the step
and the build reports success, and the artifact looks finished until someone opens it. A silent
failure documented elsewhere is still a silent failure.

v0.10 checks the document rather than the environment. Only what the document actually contains
matters — a Latin-only document on a runner with no CJK font has no problem — and the unit is the
**grapheme cluster paired with the computed font of the element it appears in**, not a representative
character per script and not a bare codepoint. A script's common characters resolving says nothing
about the extension blocks beside them; and a cluster — a variation sequence, a base with a
combining mark, an emoji ZWJ sequence — is what a reader sees fail, so it is what the report should
name. The cluster is measured first, and its codepoints only when the cluster is not itself a single
notdef box, which is what separates a cluster that comes out as one tofu from a sequence that falls
apart into several. Pairing with the computed font matters because body text, code blocks, and a
custom theme need not resolve to the same family. The check runs after `document.fonts.ready`, so a
theme's data-URI webfont is counted as present.

What this does **not** reach is a sequence every codepoint of which draws and which the font merely
declines to compose — an emoji ZWJ sequence rendered as its three components instead of one. That is
a composition failure rather than a missing glyph, and no amount of comparing against a notdef
advance can see it; separating it from a correct composition means measuring the cluster against the
sum of its parts, which is where the false positives live. It is left out for the same reason `warn`
is the default.

Three ways of asking were measured in the development image (Chromium with `fonts-liberation`,
`fonts-noto-cjk`, and `fonts-noto-color-emoji`) against characters it can draw — `A`, `日`, `✅` — and
characters it cannot: Old Persian `U+103A0`, Adlam `U+1E900`, Tibetan `U+0F40`, Yi `U+A000`.

Two of them do **not** work:

- Comparing the advance width against a family name that cannot exist reported the same width for
  every sample, drawable or not. A nonexistent family falls through the same fallback chain as
  everything else, so the comparison measures one fallback against another.
- CDP `CSS.getPlatformFontsForNode` reported a font with a glyph count for the undrawable characters
  too — `Liberation Sans:2` for Old Persian and Adlam alike. It answers which font Chromium reached
  for, not whether that font had anything to give.
- `document.fonts.check()` returns true both for a nonexistent family and for a stack asked about a
  character none of its fonts contain; it reports whether further loading is needed, not whether a
  glyph was found.

What does work is comparing against a **reference codepoint that no installed font is expected to
draw**, rather than against a missing family. `U+10FFFD`, the last private-use codepoint, measured
11.69 px at 32 px, and every undrawable sample measured exactly 11.69 px while every drawable one
differed (`A` 21.34, `日` 32.02, `✅` 39.94). Rasterising the cluster and the reference into a canvas
and comparing the pixels separated the same two groups. The check therefore measures the advance width
as a cheap filter and confirms a hit by rasterising, since a real glyph could coincidentally share the
notdef advance but not its bitmap. It runs in the browser already open for the build, which costs no
extra startup.

`U+10FFFD` is private use, which means a font *may* map it — the reference is conventional, not
guaranteed. So the check validates its own reference first, per font stack, against two controls: a
second private-use codepoint from a different plane, and a **noncharacter** (`U+FDD0`). If any of the
three disagree, something on this machine draws characters that were supposed to have no glyph, the
comparison is unsound, and the check reports itself unusable for this environment rather than
producing findings it cannot stand behind.

The noncharacter is the half that makes the validation mean anything. Two private-use codepoints
agreeing only proves that they render alike, which is exactly what a font mapping both of them to one
glyph does — and then the reference *is* a glyph, every genuinely missing character differs from it,
and the check reports a clean document while seeing nothing at all. A noncharacter is never assigned
a glyph, so it pins the comparison to the notdef box itself. Measured in the development image,
`U+10FFFD`, `U+FFFFD` and `U+FDD0` all come out at 11.69 px with the same bitmap, alongside the
characters it cannot draw.

The result names the clusters at risk and gives an example of a font covering them, drawn from a small
built-in script-to-example table — not a package name, because what supplies a face differs across
Debian, Windows, and every other platform, and naming the wrong one is worse than naming none.

Top-level `fontCheck: warn | error | off` follows the vocabulary `assets.onLargeImage` already
established. The **default is `warn`**, and that is the point: the check is a heuristic over Chromium's
fallback chain, so by default a false positive must not be able to break a build that would have been
fine. `error` exists for someone who would rather CI stopped, and choosing it means accepting that a
false positive stops it too — which is a trade the person configuring it makes knowingly, not one the
default makes for them.

`pre-render` is measured in its own rendering context rather than on the finished HTML, because
re-measuring the embedded SVG would not reproduce the font resolution that produced it. The PDF header
and footer fragments are a third context; they are checked in v0.10 only for the default fragment,
whose content monodocs controls.

### 24.3.4 A Blank Last Sheet (v0.11)

A document short enough to fit on one sheet came out on two, the second empty but for the page
number. Found while measuring page breaks, where every count was one higher than the document
called for.

The cause is two rules that exist to fill a screen — `html, body { height: 100% }` and
`#app { min-height: 100vh }` — meeting the destination anchor that `pdf.bookmarks` inserts at the
top of each page. Neither is enough on its own: measured, a one-sheet document with that anchor
stays at two sheets when either rule is turned off in print and drops to one only when both are.
Paper has no viewport, so the print block turns off both. A 49-sheet document is unchanged, which is
what says the fix removes a blank sheet rather than a page's worth of content.

### 24.4 Display Mode for PDF

Separately from the pseudo-page display of the HTML, a print mode that lays out all pages vertically is provided for PDF.

```text
interactive mode:
  display one page at a time via hash route

print mode:
  expand all pages vertically
```

### 24.5 Page Numbers (v0.10)

`page.pdf()` received only `format`, `margin`, and `printBackground`, so `displayHeaderFooter` kept
Chromium's default of off and the generated PDF had no page numbers at all. A document meant to be
printed and handed round needs them: without a number there is no way to say where to look, which is
most of what a PDF is for once it leaves the screen.

v0.10 turns the footer on by default, centred, showing the page number and the total. Its content is
deliberately language-neutral — digits and a separator — so that the one piece of text monodocs adds
to every page does not itself need translating (23.4).

The header and footer are HTML fragments handed to Chromium, not a monodocs template language.
Chromium substitutes into elements carrying its own classes, so the default footer is literally

```html
<span class="pageNumber"></span> / <span class="totalPages"></span>
```

and `pageNumber`, `totalPages`, `title`, `date`, `url` are the classes a replacement can use. There is
no `{{pageNumber}}`: introducing monodocs tokens over Chromium's classes would add a substitution and
escaping layer to specify and maintain for no gain, since the fragment is already HTML.

The fragments inherit none of the document's styles, so the default sets its own font and size rather
than relying on Chromium's unstyled default. `pdf.header` and `pdf.footer` take `false` to remove one
or a fragment to replace it, and **`false` emits an explicitly empty fragment rather than omitting the
option**: with `displayHeaderFooter` on, Chromium falls back to its own built-in header — the date and
the document title — when handed nothing, so omission would produce the opposite of what was asked.

Chromium sizes the header and footer bands to the top and bottom margins rather than taking space
from the content, so the default 20 mm accommodates the built-in single-line template — 8 pt of text
inset 15 pt from the paper edge — and no page reflows. This is an addition to the page, not a change
to its layout.

What a band too small for its content does depends on whose template it is, which was measured rather
than assumed. Chromium's built-in template hides itself: with the templates omitted, the text-showing
operators in the generated PDF dropped from 31 at a 20 mm and 10 mm bottom margin to 17 at 5 mm, 2 mm,
and 0 mm — the header and footer stop being drawn somewhere between 10 mm and 5 mm rather than being
cut in half. A supplied fragment does not: the same count stayed at 6 for every margin from 20 mm down
to 0 mm.

Since monodocs supplies a fragment, its footer is always drawn, and a margin too small for it produces
a footer against the paper edge rather than a footer that vanishes. That is still worth a warning. The
threshold is not a chosen number: it is the rendered height of the default fragment, measured at build
time, so it stays correct if that fragment ever changes. The warning does not cover a replacement —
arbitrary HTML and CSS cannot be judged from the margin value alone, and pretending otherwise would
mean either false warnings or a promise that only measurement could keep.

The bookmark and metadata passes run on the finished bytes (24.3.2) and are unaffected.

### 24.6 Page Density (v0.10)

The default theme is set for reading on a screen, which is the right default and the wrong one for
a document that has to fit on a given number of sheets. Converting an A4 business document with
0.9.0 produced nine pages where the same body hand-set at 9.5pt with 14mm margins produced four, and
nothing in the configuration could close that gap: `pdf.margin` was the only lever, and margins are
not what decides the count. Measured across the full range from 25/30mm to 10/8mm, that document
stayed at nine pages except at the widest setting. Type size, leading, and cell padding decide it,
and none of the three was reachable.

`pdf.density` reaches them. It takes either a preset name or an object:

```yaml
pdf:
  density: compact
```

```yaml
pdf:
  density:
    base: compact
    fontSize: 12px
    lineHeight: 1.5
```

Four presets ship. The values are the ones that decide a page count, moved together, because moving
one alone rarely reads well — smaller type against unchanged leading looks lost on the line:

| | fontSize | lineHeight | headingSpacing | tableCellPadding |
| --- | --- | --- | --- | --- |
| `relaxed` | 16px | 1.7 | 1.8em | 0.5rem 0.8rem |
| `normal` (default) | 16px | 1.45 | 0.9em | 0.35rem 0.6rem |
| `compact` | 14px | 1.35 | 0.8em | 0.3rem 0.5rem |
| `tight` | 12px | 1.3 | 0.6em | 0.2rem 0.35rem |

The documentation set in `examples/ja` comes out as 56, 49, 44, and 40 sheets across the four.

**The default is set for paper, and the ladder runs both ways.** The first version of this shipped
three presets whose top step was the screen setting, which made the ladder one-directional and left
the default looser than a printed page has any reason to be. It was also buying sheets in the wrong
currency. The screen values and the default now set the same 16px body: everything between them is
leading, heading spacing, and cell padding, and that alone is 56 sheets down to 49 — as many as the
old `compact` bought by dropping the type to 13.5px. Type size only starts moving below the default,
because it is the lever with a second effect: the measure is whatever `pdf.margin` leaves, so smaller
type is a longer line — about 42 Japanese characters at 16px in the default A4 margins, and 56 at
12px. Someone who wants tighter type without the longer line widens the margin in the same change,
which is a decision that belongs to them rather than to a preset.

**`relaxed` is the screen setting under a name**, for a document read on a screen and printed only
now and then. Naming it is what lets the default move: before, "the same as on screen" and "the
default" were one table, and neither could change without the other.

**Only what differs from the screen is emitted**, which is a separate constant (`PDF_DENSITY_SCREEN`)
rather than the default preset. Asking for `relaxed` therefore writes no print rules at all, and the
default writes no font size — the theme sets none on the root, so the HTML still prints at whatever
base size the reader's browser uses. The same rule applies inside the object form.

**Why a preset rather than `pdf.scale`.** Puppeteer's `page.pdf()` already takes a `scale`, and
passing it through would have been one field on an existing call. But scale shrinks the finished
page: the line breaks, the column widths, and the rule weights are all decided at the original size
and then photographed smaller. A density changes the size the page is set at, so the text re-flows
and the table columns are re-measured at the size they will be read. In a document made largely of
tables — which is the case that raised this — that is the difference between a page that was
designed small and one that was reduced.

**Why the object form has `base`.** Someone who wants "compact, but 12px" should not have to copy
the other three values; a copy is what gets left behind when a preset is later retuned. `base` names
the table to start from and the object replaces only what it names, which is the resolution order
`html.labels` already uses over the table `lang` chose (23.4).

**What is deliberately not here.** There is no measure — no maximum width for the text column. The
column is what `pdf.margin` decides, and a second cap would fight it: a reader who narrowed the
margins to fit more would find the text stopping short of the margin they set. Its right value also
differs between scripts, which makes it a poor thing to freeze into a preset. There is also no hook
for arbitrary CSS. A stylesheet hook would cover this case and every other one, at the cost of a
public surface with no shape to it; the density is a closed set of keys that 1.0 can freeze.

The values reach the generated stylesheet, so they are validated as plainly a number and a unit —
`calc(...)` and anything carrying a `;` are refused, at the configuration boundary and again at
`renderSingleHtml`, which is a public entry point of its own.

The rules are `@media print`, which is what makes one artifact serve both readings: the same HTML
stays as it was on screen and is set tighter on paper. `--format pdf` goes through the print
stylesheet, so it gets the same treatment, and so does a reader printing the HTML from a browser.

**The documentation site shows the four rather than describing them.** A page count is the claim, and
a table of numbers is a poor way to make it. `site/samples/density/` holds one short document per
language, and `site-build.sh` builds each of them four times, changing nothing but the density, into
`site/public/density/`; the first page of every PDF becomes its own thumbnail through `pdftoppm`, so
what the site shows is the artifact rather than a picture of a print preview. The configuration
reference links the four sheets side by side. The sample document's own text says what to look at,
which is also how it stays honest: it is set at the density it is describing.

### 24.7 Page Breaks (v0.11)

A source file already starts a new sheet — the print stylesheet breaks before every `.page` but the
first — so the unit of a page break is the file. Inside a file there is none, and there is no way to
say "break here" either. Splitting the input differently is not the answer: the split also decides
the sidebar and the routes, and those are not the author's page-break decisions.

Two things are added: a marker the author places anywhere, and a setting that breaks before headings
down to a chosen level.

**The marker is spelled the way the rest of the world spells it.** AsciiDoc already has one: `<<<` is
Asciidoctor's page break, and it arrives in the single HTML as `<div class="page-break"></div>`,
where it does nothing, because no rule has ever matched that class. Making it work is one rule.

Markdown has no page break in CommonMark, and the spellings other tools settled on divide into three
groups. An empty `<div>` — `<div style="page-break-after: always"></div>`, or
`<div class="page-break"></div>` where a stylesheet is involved — is what Typora, the
Markdown-to-PDF converters, the MkDocs PDF plugins, and a browser's own print dialog understand. A
LaTeX command, `\newpage` or `\pagebreak` in a raw TeX block, is Pandoc's, and R Markdown's through
it. A shortcode or a directive is Quarto's `{{< pagebreak >}}`, iA Writer's `+++`, and the
generic-directive proposal's `::pagebreak`.

monodocs takes the first, written `<div class="page-break"></div>`, with
`<div style="page-break-after: always"></div>` accepted as the same thing and normalised to it. It
is the only one of the three that is not a single tool's syntax: the same file breaks in the other
converters and in a browser's print dialog. It is also invisible in a repository's Markdown preview,
where `\newpage` and `{{< pagebreak >}}` show as literal text. And the class name is not monodocs'
to choose — Asciidoctor emits it already, so one rule serves both formats.

**Markdown does not gain raw HTML.** Raw HTML in Markdown is dropped (16.1), and that boundary does
not move. What is recognised is a marker that happens to be spelled like HTML: the mdast `html` node
is matched against two spellings before `remark-rehype` sees it, and a match is replaced with
an element monodocs builds — a `div`, one class, no children — rather than by re-emitting what the
author wrote. Nothing from the input reaches the output, so this is not a way in for an attribute or
a script. The accepted language is small enough to audit by eye:

- lowercase `div`, opening and closing tag inside one node
- exactly one attribute: `class="page-break"` or `style="page-break-after: always"`, either quoting
- in the `style` spelling, spaces or tabs after the colon or none at all, and an optional trailing
  `;` — one declaration, no more
- ASCII whitespace around the `=`, before the `>`, and around the marker, and at least one of it
  after `<div`
- nothing between the tags, whitespace included
- a block node at the root of the document, so a marker inside a blockquote, a list item, a table
  cell, or a heading is not one

`<DIV>`, `class="page-break foo"`, a second attribute, `<div class="page-break"/>`, a newline
between the colon and `always`, and a `style` carrying a second declaration are rejected rather than
repaired. They stay what raw HTML in Markdown has always been: dropped. The list above is what the
configuration reference enumerates for the reader, because 1.0 freezes it.

**`pdf.pageBreakLevel` breaks before headings.**

```yaml
pdf:
  pageBreakLevel: 2
```

`false`, the default, breaks before no heading and leaves every existing document as it is. A number
is the deepest level that starts a new sheet: `2` is h2 only, `3` is h2 and h3, `6` is h2 through h6.
h1 is not a level here — it is the page title, and the file it belongs to has already broken.

**Which heading is skipped needs a definition, not a phrase.** A heading with nothing but the page
title in front of it must not break, or every page opens with a sheet holding one line. "The first
heading of the page" is the wrong rule for that: a page that opens with its title, an introduction,
and then its first `## Section` should break there, because the introduction belongs on the title's
sheet. The rule is therefore about what precedes the heading rather than about which heading it is —
a heading breaks unless nothing renders before it, or the only thing that does is the page's h1.

**Headings inside blocks that must not be split are not candidates.** `break-inside: avoid` is set on
tables, figures, code blocks, admonitions, and blockquotes (24.3.1), and a forced break before a
heading inside one of those asks Chromium for both at once. Only headings at the page's own level
are considered; for AsciiDoc that means walking the `.sect1`–`.sect5` wrappers, which are structure
rather than content.

**The decision is made in the pipeline, not in a selector.** Markdown produces a flat body and
Asciidoctor a nested one, so a CSS rule expressing "unless the page title is all that precedes it"
has to enumerate both shapes, and still cannot see a page whose h1 is missing or whose first heading
is an h3. Post-processing marks the headings that will break with `data-monodocs-pdf-break-before`,
and one rule matches the attribute. The name is namespaced because a custom theme and an AsciiDoc
passthrough can both put attributes on a heading.

**The space above a heading that starts a sheet is dropped.** Measured: the margin `pdf.density`
sets survives a forced break — the same document puts the heading 15.8pt lower at `relaxed` than at
`normal` — and at the top of a fresh sheet that space separates the heading from nothing. The rule
writes `margin-top: 0`, the same property the density rule writes, so the cascade needs no reasoning
about logical and physical longhands.

**Both rules are emitted by core**, into the print stylesheet beside the density rules, rather than
added to the default theme. A theme replaces `style.css` wholesale, and a theme should not be able
to delete a syntax feature. They name `#content` and `.page` alike, for the reason 24.6 gives.

`break-after: page` rather than `break-before`, which is what the file boundary uses. Measured: the
marker is an empty box, so a break in front of it moves the box itself onto the new sheet, and a
two-page document whose first page ends with a marker comes out as three sheets under `break-before`
and two under `break-after`. Every other case measured the same under both. A marker with nothing
behind it leaves one blank sheet either way — that is what asking for a break with nothing after it
means — and so do two markers in a row, which is how a blank sheet is asked for.

**What is deliberately not here.** No "keep together" marker: the print stylesheet already avoids
splitting the blocks where it matters, and a general one is a second layout language. No per-file
override of `pageBreakLevel`, because frontmatter that changes how the paper is set would make a
document's sheet count depend on which files it happens to include. No arbitrary CSS hook, for the
reason 24.6 gives — a closed key set is what 1.0 can freeze.

### 24.8 The Cover (v0.14)

A PDF handed to someone begins with a cover: the title, what version it is, when it was true, and
who is answerable for it. monodocs begins with the first page of content. An author can write a page
that looks like a cover, and it is then a page — it appears in the sidebar of the HTML, it is
searchable, it is numbered, and it is followed by the same content as everything else.

```yaml
pdf:
  cover:
    enabled: false # true generates a cover from document (13.5)
```

The cover is **generated from `document`**, not authored. Everything on it — title, version, date,
authors — is already configured for other reasons (13.5), and a generated cover means the PDF cannot
disagree with the PDF's own properties. It is a fixed layout with no options: a document that needs
a logo and a customer's house style needs a designer, not eleven more configuration keys, and 24.6
already recorded that a closed key set is what 1.0 can freeze.

`pdf.cover.enabled` is an object rather than `pdf.cover: true | "./cover.md"`, because an
author-written cover is the obvious next request and a polymorphic key cannot grow a second field.
The object can: `source` is where a `cover.md` would go when there is a reason to add it.

**Numbering starts after the cover, and that is the hard half.** Chromium's footer knows the
physical sheet it is drawn on; it has no offset, so a cover makes every number one too high and the
total one too many. What can be done on the finished bytes is where this is solved: the cover is one
sheet monodocs itself produced, so the footer is suppressed on it and the numbers on the remaining
sheets are the ones the document should show. PDF page labels (the numbering a reader sees in a
viewer's page box) are set the same way, so the viewer agrees with the paper.

Whether the footer can be suppressed on one sheet without a second render is what v0.14 measures. If
it cannot, the cover is rendered as its own single-page PDF with no header or footer band and
concatenated — the outline and metadata passes already run on finished bytes (24.3.2), so the
machinery for that is the machinery already there.

The HTML gets no cover. A cover is a sheet of paper; on screen the same information belongs where a
reader can see it without scrolling past it, which is the branding footer 13.5 already fills.

### 24.9 A Table of Contents on Paper (v0.14)

`pdf.bookmarks` produces an outline a viewer shows in a side panel. Paper has no side panel. A
printed specification opens with a table of contents that lists each section and the page it starts
on, and monodocs cannot produce one, because nothing in the pipeline knows what page anything is on
until Chromium has already produced the PDF.

```yaml
pdf:
  toc:
    enabled: false
    depth: 2 # deepest heading level listed (2–6)
```

**This is the most expensive feature in this document, and it is specified with the way it fails.**
The shape is two renders:

1. Every heading that could be listed gets a named destination, the way pages already get one
   (24.3.2 injects `page-{id}`; this adds `h-{id}`)
2. The table of contents is rendered into the document with its page-number column filled by a
   fixed-width placeholder, and Chromium produces the first PDF
3. Each destination's `pageRef` is resolved to a page index by matching it against the document's
   page tree — `pdf-lib` already reads the `/Dests` dictionary for the outline (24.3.2)
4. The numbers are substituted into the table of contents and Chromium produces the second PDF
5. The destinations are read **again**, from the second PDF, and compared against the numbers it
   prints. A mismatch means the substitution moved something across a page boundary

Step 5 is the feature. Without it this is a table of contents that is usually right, and a page
number that is usually right is worse than none: a reader who finds one wrong number cannot trust
the rest of the list, and cannot tell which ones to check. So the numbers are verified against the
document that will be delivered, a bounded number of further passes is allowed for a document that
has not settled, and **a build that has not converged fails** rather than shipping a plausible list.

Convergence is helped rather than hoped for. The placeholder reserves the width of the largest page
number the document could have, the column is set in tabular figures so that 9 and 10 occupy the
same width, and the table of contents is laid out so that its own length changes only when an entry
wraps — which is why `depth` exists and why it defaults to 2.

The cost is a second Chromium render: roughly twice the PDF stage, including a second run of
client-mode Mermaid, more memory, and an intermediate PDF. That is why it is off by default, and why
the density work's standard applies — the timing is measured on a real document of a hundred-odd
sheets, on both supported platforms, before this is called done.

**Running headers are not part of this.** "The current chapter's name at the top of every sheet" is
the next thing anyone asks for, and it is not the same mechanism: a table of contents writes numbers
into the body, where a second render can put them, while a running header writes a different string
into each physical sheet's margin. CSS has `string-set` and `string()` for exactly this, and
Chromium does not implement them; Chromium's own header template substitutes only its fixed classes
(24.5). What remains is rendering the document in chapter-sized pieces and concatenating them, which
is a different feature with a different cost, and it is not scheduled.

### 24.10 Watermark (v0.13)

A document that is a draft, or that is not to leave the building, says so on every sheet. Today an
author who needs that edits the theme, which is a stylesheet replacement (23.3) that then owns every
other print rule as well.

```yaml
pdf:
  watermark: false # false (default), or the text to print
```

Text, one line, diagonal, behind the content, on every sheet including the cover, at a weight that
photocopies without hiding what it covers. No image, no per-page control, no font or angle or
opacity: those are the keys that turn one feature into a layout language, and the text is what the
feature is for.

It is emitted by core into the print stylesheet, beside the density and page-break rules and for the
same reason 24.7 gives — a theme replacing `style.css` must not be able to delete "CONFIDENTIAL"
from a document that asked for it. The text is escaped rather than inserted, because a configuration
value that reaches the output as markup is a way in for markup. It appears in PDF output and when
the HTML is printed from a browser; on screen it does not, since a watermark's purpose is to survive
being printed and handed on.
---

## 25. CLI Specification

### 25.1 init

```bash
monodocs init
```

Generated artifacts:

```text
monodocs.config.yml
docs/
  index.md
```

Specified here from the beginning and implemented in v0.10; until then the CLI offered only `build`,
`watch`, `serve`, and `validate`, and this chapter described a command that did not exist.

It writes exactly the two files above and **refuses to overwrite** anything already present, naming
what it found and writing nothing at all, so that running it in a populated directory cannot destroy
work. Both are checked before either is written: a run that stopped halfway would leave a scaffold
the author then has to take apart to see which half is theirs. It names everything it found rather
than the first one, so a second run does not report a second file. A `docs/` directory that already
exists is not something it overwrites — the page is added beside what is there.

The generated configuration is a short commented starting point, not a dump of every key: a dump
would have to be regenerated with every option added, and it teaches the reader to keep keys they
have not understood. It points at the configuration page of the documentation site for the rest.

**The whole scaffold follows the message language (25.6), including the `lang` it writes.** The
comments are the obvious part; the first page is the reason. That page is prose, and prose is in a
language, so `--lang ja` writes a Japanese page — which under the default `lang: "en"` would be a
document declaring one language while displaying another, exactly what 23.4 exists to end. The two
settings stay independent everywhere else, and the config it writes says so in a comment; what
couples them here is that init authors the document as well as configuring it, and it can only
author in one language. Anyone documenting in a third language changes one line, which is the line
the comment above it explains.

### 25.2 build

```bash
monodocs build
```

Input/output specification:

```bash
monodocs build ./docs -o ./dist/docs.html
```

Format specification:

```bash
monodocs build ./docs --format html -o ./dist/docs.html
monodocs build ./docs --format pdf -o ./dist/docs.pdf
monodocs build ./docs --format both -o ./dist/
```

The input may be a single file as well as a directory (v0.10):

```bash
monodocs build ./docs/plan.md --format pdf -o ./dist/plan.pdf
```

Until v0.10 the input was checked with `existsSync` alone, so a file passed that gate and failed
further in, inside `readdir`, as Node's own `ENOTDIR: not a directory, scandir`. That names neither
the constraint nor the fix, and pointing a tool that produces one file at one file is the first
thing a new reader tries. It is also a reasonable request rather than a mistake — monodocs bundles a
set of pages into one artifact, and a set of one is still a set — so the file is accepted instead of
diagnosed. The directory holding it becomes the base for its links, images, and `monodocs.config.yml`,
which is the same relationship an input directory has to what it contains. The exclude patterns
(12.3) do not apply: naming a file is an explicit choice, so `_draft.md` is a page when it is asked
for by name. A file whose extension no renderer claims is refused, naming the extensions that work.


**More than one directory (v0.12).** The input argument still names one path, and a document that
spans several sets `root` and `sources.include` in the configuration instead (12.5). The CLI is not
given a variadic input list: two paths on a command line would have to answer where the
configuration is, what routes are relative to, and which directory an image may be read from, and a
command line is the wrong place to settle a question the configuration file already answers.
### 25.3 watch

```bash
monodocs watch
```

Watches for changes to Markdown / AsciiDoc / configuration files and rebuilds.

### 25.4 serve

```bash
monodocs serve
```

Starts a local server and previews.

### 25.5 validate

```bash
monodocs validate
```

Validation targets:

- Markdown broken links
- AsciiDoc broken xref
- Image file existence
- Missing H1 / document title
- Duplicate routes
- Invalid configuration file
- Basic validation of Mermaid blocks


**What `validate` is (v0.11).** It is a build that writes nothing: it runs the same `preparePages`
as `build`, so every check it reports is a check a build reports too, and nothing is checked twice in
two places (architecture.md). The other direction does not hold, and saying it did was sloppy: a
build that writes a PDF also reports what only that work can find — a margin too small for the
page-number band, a character no font on the machine can draw, a diagram that failed to pre-render. Mermaid `pre-render` is forced to `client` so that no browser starts, which means
diagram syntax errors are outside its scope and it says so rather than implying a check it does not
run.

**What fails the command.** An error fails it; a warning does not, unless `--strict` says so. This
reverses the decision recorded here before v0.11 shipped — "it exits non-zero when anything is
found, so there is no `--strict` to add" — and the reason is 12.4. A minor release may add a check,
and additions "cannot break a configuration that does not use them"; but a new warning, on a
document nobody has touched, turned a green job red. Flattening the two severities in the exit code
also contradicted the report, which publishes `severity` for a consumer to act on: a job that reads
`warning` and then finds the process dead has been told two different things. A warning gate is
worth having and is now a decision — `--strict` — rather than the only behaviour. Taken before 1.0
because a default only changes in a major release (12.4).

What `validate` lacked was a form a machine can read: a CI job that wanted to annotate a pull
request had to parse translated prose, which changes with the language and with any rewording
(12.4).

```bash
monodocs validate --format json
```

The JSON is the diagnostics model (27.3) serialised, versioned by its own schema version, and it is
alone on stdout — not even the summary line goes with it, because a stream that is sometimes JSON
and sometimes JSON with a sentence after it is not a format. `schemaVersion` is what a consumer
pins: it moves when the shape moves, and adding a check or a code does not move the shape. Three
checks arrived with it, chosen because each one is decidable from what the pipeline already holds:

- **A heading level skipped** — an `h2` followed by an `h4`. It breaks the in-page table of contents
  (22) and every assistive technology that navigates by heading level
- **An image with no `alt` attribute at all.** An explicitly empty `alt=""` is not a finding: it is
  how an author marks a decorative image, and the lightbox already honours that distinction (23.2)
- **A cross-file link whose anchor does not exist**, which already warned during a build and was
  therefore already known — it appears in the report as a diagnostic with a code rather than a line
  of prose

**What the `alt` check can actually see.** Measured against both formats after implementing it:
Markdown's `![](x.png)` comes out as `alt=""`, which is the decorative spelling and deliberately not
a finding, and Asciidoctor derives an alt from the file's basename, so `image::x.png[]` comes out as
`alt="x"`. An image with no attribute at all therefore reaches the output only from an AsciiDoc
passthrough block — which is where the check fires, and it is the one path neither converter is
guarding. A theme's own markup is not covered, and saying it was would have been the drift this
milestone exists to remove: the checks run over each page's body, and the template is applied after
them. Reporting `alt="x"` as "derived from the filename" is not an option:
nothing in the output says whether the author wrote it. So the check is narrower than the sentence
that specified it, and this is what it covers.

The first two run in post-processing, beside every other finding, so a build reports them too: what
`validate` reports is what a build reports, and a check that lived only in `validate` would break
that. Neither carries a line, because the tree they walk is the rendered HTML and a position in it
describes the generated document rather than the file the author edits. Neither reports the first
heading of a page whatever its level, since a page whose title comes from frontmatter legitimately
opens at `h2`.

**External links are not checked.** A link checker that reaches the network makes the result depend
on when it ran and on what the network between the runner and the site was doing: a rate limit, a
site that refuses `HEAD`, a login wall, and a redirect chain all look like a broken link, and a CI
job that fails for those reasons teaches everyone to ignore it. It would also turn a build into a
process that fetches URLs written by whoever wrote the document, from inside a CI runner, which is
not a capability this tool should acquire. Tools that specialise in link checking exist, they run
next to monodocs in the same workflow, and they own that problem's failure modes.

**"Orphan pages" are not checked either.** Every page is reachable from the sidebar — that is an
invariant of the output (architecture.md), not a property to test — so the only thing such a check
could mean is "no other page links to it", which is true of most pages in most documents and would
report a finding for each.
### 25.6 Message Language (v0.10)

Every string the CLI printed — `--help`, each error, each warning — was Japanese only, while the
README, the documentation site, `CONTRIBUTING.md`, and `SECURITY.md` are English with a Japanese
mirror. Someone who ran `npm install -g monodocs` off the English README met a Japanese `--help`,
and the failure that most needs to be understood, the one that explains why PDF output cannot find a
browser, was unreadable to most of the audience npm reaches.

v0.10 makes English the default and Japanese an explicit choice: `--lang ja` on any command, or
`MONODOCS_LANG=ja` for a shell or a CI job that should not repeat the flag. The flag wins over the
environment variable, which wins over the default. Existing Japanese users see their messages change
language unless they set one of the two — a breaking change, taken before 1.0.

`LANG` and `LC_ALL` are deliberately **not** consulted. Auto-detection would be convenient and would
make a build log depend on which machine produced it, so a log pasted into an issue could not be
reproduced from the command alone. An explicit setting is worth the one-time cost of setting it.

`--help` means the whole of it. Commander generates the `Usage:`, `Options:`, and `Commands:` headings
and the description of `--help` itself, and leaving those in English while translating the descriptions
around them would produce a help screen in neither language. Commander exposes these through
`configureHelp` and `addHelpText`, so they go through the same catalogue as everything else. What stays
out of scope is a message monodocs never sees before it is printed — a Zod parse error or a Puppeteer
stack that reaches the user unwrapped. Where monodocs already wraps one, the wrapper is translated.

This is separate from the document's `lang` (23.4), which describes the pages being built rather than
the terminal building them.

---

## 26. VS Code Extension

> This chapter describes a frozen milestone. See v0.7 in the roadmap section for why it is not scheduled.

The VS Code extension is implemented after the core / CLI stabilizes.

### 26.1 Commands

```text
Monodocs: Init
Monodocs: Build HTML
Monodocs: Build PDF
Monodocs: Preview
Monodocs: Watch Preview
Monodocs: Validate Links
```

### 26.2 Configuration

```json
{
  "monodocs.configFile": "monodocs.config.yml",
  "monodocs.outputFile": "dist/docs.html",
  "monodocs.preview.autoRefresh": true
}
```

### 26.3 Implementation Policy

Do not write conversion logic inside the VS Code extension.

```text
vscode-extension
  ↓
@monodocs/core
  ↓
buildSite()
```

---

## 27. Errors and Warnings

### 27.1 Errors

The following are treated as errors.

- The input directory does not exist
- There is not a single Markdown / AsciiDoc file
- Cannot write to the parent directory of the output
- The configuration file is invalid
- A file specified in the custom sidebar does not exist
- Routes are duplicated and cannot be resolved

### 27.2 Warnings

The following are treated as warnings.

- No title exists
- There are multiple Markdown H1s
- No AsciiDoc document title exists
- The image size exceeds maxInlineSize
- A link cannot be resolved
- An xref cannot be resolved
- Conversion of a Mermaid block failed
- A file that appears to be for include has become a target for page generation

### 27.3 Diagnostics (v0.11)

Errors and warnings were strings. `validateSite` returned `errors: string[]` and
`warnings: string[]`, the CLI printed them with a prefix, and that was the whole model. It worked
because the only consumer was a person reading a terminal.

A machine-readable report (25.5) cannot be built on that. Serialising a translated sentence produces
a format whose fields change when the language changes and whose contents change whenever a message
is reworded — and 12.4 promises the opposite of that for anything a CI job pins. What the wording
carries is carried by something else first:

```ts
type Diagnostic = {
  code: string; // stable identifier, e.g. "link/unresolved"
  severity: "error" | "warning";
  path?: string; // source file, relative to the input root
  line?: number;
  column?: number;
  message: string; // the translated sentence, for a person
};
```

The `code` is the promise; the `message` is the courtesy. A code is added when a check is added and
is not renamed afterwards, so a job that ignores `image/large` keeps ignoring exactly that. The
translated sentence stays in the report because the report is also read by people, and a report that
made a person look a code up would be worse than the strings it replaces.

The pipeline already knew more than it said. `formatSourceRef` composed a file and a position into
prose for several warnings, which means the position existed and was being flattened on the way out;
it is now taken once and used for both, so an unresolved link reports its line as a number as well as
inside its sentence.

**Every error carries one too.** Everything monodocs throws is a `MonodocsError` with a code, so the
error that stopped a build is reported as the finding it is rather than as a sentence with no
identity — `BrowserSetupError` and `FontCheckError` are that class with a code of their own. An error
from somewhere else that reaches the same boundary is reported as `internal/unexpected`: a consumer
filtering on codes must not be able to lose a finding by it having none. `validateSite` returns the
diagnostics and the two severities split out of them, so a caller reading either half reads no
less.

**Message catalogue and codes are separate things.** 25.6 made every string translatable, and this
adds a second identity beside the translation: a message key selects the wording, a diagnostic code
identifies the finding. Two messages can share a code — the same finding worded for two contexts —
and a message may have no code at all, since not everything printed is a diagnostic.
---

## 28. Testing Policy

### 28.1 Unit Tests

Targets:

- config loading
- format detection
- Markdown title extraction
- AsciiDoc title extraction
- route generation
- sidebar generation
- link conversion
- xref conversion
- image embed
- heading ID generation

### 28.2 fixture Tests

Example:

```text
tests/fixtures/
  markdown-basic/
  asciidoc-basic/
  mixed-basic/
  images/
  mermaid/
  links/
```

For each fixture, run the CLI and validate the output HTML.

### 28.3 E2E Tests

```bash
monodocs build tests/fixtures/mixed-basic/docs -o tmp/docs.html
```

Check items:

- An HTML file is generated
- Markdown pages are included
- AsciiDoc pages are included
- The sidebar is generated
- Images are converted to data URIs
- Mermaid is converted into a displayable structure
- Internal links are converted into hash routes

### 28.4 PDF Tests

Added after PDF output is supported.

Check items:

- A PDF is generated
- The page count is not 0
- Mermaid is rendered
- Images are not missing
- Print CSS is applied

---

## 29. Roadmap

## v0.1: Markdown Single HTML MVP

Purpose:

Create a minimal configuration that can generate a single HTML from a group of Markdown files.

Implementation scope:

- Initialize the monorepo
- Create the core package
- Create the cli package
- Load the configuration file
- Scan the input directory
- Collect Markdown files
- Extract Markdown titles
- Support GFM
- Create the Page model
- Generate the folder-structure sidebar
- Convert Markdown -> HTML
- Output single HTML
- Pseudo-page switching via hash route
- Highlight the current page in the sidebar

Completion criteria:

- `monodocs build ./docs -o ./dist/docs.html` works
- Multiple Markdown files are included in a single HTML
- Pages can be switched from the sidebar
- H1 is used as the title

---

## v0.2: Basic AsciiDoc Support / Mixed Support

Purpose:

Enable mixed Markdown / AsciiDoc documents to be output to a single HTML.

Implementation scope:

- Introduce the Source Renderer Architecture
- format detection
- Add the AsciiDoc renderer
- Read `.adoc` / `.asciidoc` / `.asc`
- HTML conversion via Asciidoctor.js
- Extract AsciiDoc document title
- Extract metadata from AsciiDoc attributes
- Generate a mixed Markdown / AsciiDoc sidebar
- Exclude AsciiDoc include files
- Add mixed fixture

Completion criteria:

- Can build even when `.md` and `.adoc` are mixed
- AsciiDoc's `= Title` becomes the page title
- Markdown / AsciiDoc are displayed in the same sidebar
- include files can be excluded from page generation targets

---

## v0.3: Practical Features

Purpose:

Bring it to a level usable for actual technical documents and in-house documents.

Implementation scope:

- Support Markdown frontmatter
- Support AsciiDoc `:sd-*:` attributes
- Support order / hidden / description
- Markdown link conversion
- AsciiDoc xref conversion
- Image embedding
- Support Markdown images
- Support AsciiDoc image macro
- Code highlighting
- Support Mermaid client mode
- Support AsciiDoc `[source,mermaid]`
- validate command

Completion criteria:

- Links between Markdown / AsciiDoc can be converted into hash routes
- Images can be embedded into the HTML as data URIs
- Markdown / AsciiDoc Mermaid can be displayed
- Sidebar display can be controlled via frontmatter / `:sd-*:`
- validate can detect broken links

---

## v0.4: HTML Documentation Site Feature Enhancement

Purpose:

Make it easy to use as a documentation site while still being a single HTML.

Implementation scope:

- Search feature
- In-page table of contents
- Previous/next page navigation
- Sidebar collapsing
- Dark mode
- Theme separation
- print mode
- Print CSS
- watch command
- serve command

Completion criteria:

- Search within the HTML is possible
- An in-page table of contents is displayed
- Local preview is possible
- Changes can be watched and rebuilt
- All pages can be expanded vertically when printing

---

## v0.5: PDF Output

Already supported.

Purpose:

Enable PDF output based on the single HTML.

Implementation: Open the single HTML with Puppeteer (`puppeteer-core` + system Chromium. Mermaid pre-render and startup processing
are shared in `pipeline/browser.ts`), and convert it to PDF with `page.pdf()` using the theme's `@media print` (all pages expanded vertically)
(`pipeline/renderPdf.ts`). `--format both` treats `-o` as a directory and outputs `docs.html` / `docs.pdf`. For client mode Mermaid,
it waits for rendering completion after all pages are expanded. Instead of the originally proposed Playwright, the policy was changed to reuse the existing puppeteer-core foundation.

Implementation scope:

- Introduce Puppeteer (reuse by sharing the existing Mermaid pre-render foundation)
- Support `--format pdf`
- Support `--format both` (`-o` is a directory)
- print mode for PDF (uses the theme's `@media print`)
- Wait for Mermaid rendering completion (client mode. Wait for `data-processed` after all pages are expanded)
- Add bookmarks (outline) with the same folder→page structure as the HTML sidebar (`pdf-lib`.
  Reference `/Dests` derived from Chromium's internal links to construct `/Outlines`. On by default)
- Support PDF settings

  - pageSize
  - margin
  - printBackground
  - bookmarks

Completion criteria:

- `monodocs build ./docs --format pdf -o ./dist/docs.pdf` works
- Mixed Markdown / AsciiDoc documents can be converted to PDF
- Mermaid and images are included in the PDF
- Can be output as an A4 PDF

Limitations: Because headless Chromium is required, it is not usable in the bundled CLI (single `.cjs` / single executable file)
(`puppeteer-core` is made `external`. The package-install version is required). Since `serve` is for preview purposes, it serves HTML
even if the configuration is pdf/both (it does not generate the PDF every time).

---

## v0.6: Distribution / CI Support

Purpose:

Make it easy to use for teams and CI.

Implementation scope:

- Prepare npm package publishing
- Document ready-to-use GitHub Actions and GitLab CI workflows
- Improve the README
- Improve examples
- Decide on a versioning policy

Completion criteria:

- Can be installed from npm
- Can generate HTML / PDF in GitHub Actions
- Can be introduced by looking at a sample project

A Docker image for users will not be provided. The existing dedicated Docker image used in the development/test environment
will continue to be maintained.

A dedicated reusable GitHub Action (`monodocs-action`) is not published. monodocs is a plain npm CLI, so a workflow
only needs `actions/setup-node` and `npx monodocs`, and a separate action would add a release and support surface with
no benefit for that. The CI guide on the documentation site carries the GitHub Actions and GitLab CI workflows instead.
Revisit this if usage shows that a reusable action would remove real boilerplate.

---

## v0.7: VS Code Extension (frozen)

**This milestone is frozen and not scheduled.** The version number stays reserved so the plan below remains
readable if the work resumes; the next milestone to be worked on is v0.8.

Three things led to the freeze:

- Demand is unknown. No request for editor integration has arrived, and the npm CLI covers the same tasks
  from a terminal or a `package.json` script.
- The maintenance cost is disproportionate for a single maintainer. Marketplace publishing, signing, and a
  release pipeline separate from npm would have to be built and kept working.
- The core boundary is undecided. Section 26.3 assumes the extension calls `@monodocs/core` directly, but
  core is still a private `0.0.0` workspace package with no public API, so that assumption cannot be acted on
  without first settling whether the extension calls core or shells out to the CLI.

Unfreezing means answering the third point first, because it determines the shape of everything else.

Purpose:

Enable previewing and output from VS Code.

Implementation scope:

- Create the VS Code extension
- Build HTML command
- Build PDF command
- Preview command
- Watch Preview
- Validate Links
- Webview preview
- Configuration file assistance

Completion criteria:

- Can generate HTML from VS Code
- Can generate PDF from VS Code
- Can preview within VS Code
- Can update the preview while editing

---

## v0.8: Advanced Features

Purpose:

Support more advanced document generation.

Implementation scope:

- Search improvements
- Improved Japanese search
- Custom themes
- Full support for custom sidebars
- Standalone binary distribution
- Homebrew / Scoop / winget support (decided against; see 8.5)
- HTML / PDF output quality improvements (print clipping, narrow screens, PDF document information)

Completion criteria:

- Search is practical even for large-scale documents
- There is a distributable that can run without Node.js
- Themes can be switched

---

## v0.9: Search Finishing

Purpose:

Finish the search. Make it find what the reader means when the document and the query spell the same
word differently — without adding a dictionary or a search runtime to the generated file — and make
the results usable without a mouse.

Implementation scope:

- Fold katakana to hiragana when matching
- Fold the prolonged sound mark, the dash family, and the wave dash / full-width tilde
- Settle half-width katakana, okurigana, and English stemming as out of scope, with the reason
  recorded in chapter 22.3
- Move through the results with `↓` / `↑` and open one with `Enter`, as an ARIA combobox
- Mark the keywords in the body of the page a result opens
- Rename the default output from `manual.html` / `manual.pdf` to `docs.html` / `docs.pdf`: monodocs
  bundles whatever set of pages it is given, and that is not necessarily a manual. A breaking change
  for anyone who relies on the default, taken before 1.0 rather than after

Completion criteria:

- A hiragana query finds katakana text and the reverse
- Dash and tilde spelling differences no longer split results
- Highlighting still marks the original spelling in the result list
- The variations that remain unsupported are recorded as decisions, not as open work
- The result list can be navigated and opened from the keyboard without leaving the search box, and
  screen readers are told which result is selected
- Opening a result shows where the keywords are in the body, and clearing the query puts the body
  back as it was
- Omitting `-o` writes `./dist/docs.html`, `--format pdf` writes `./dist/docs.pdf`, and `--format both`
  writes `docs.html` / `docs.pdf` into the directory it is given

---

## v0.10: Language and Pre-1.0 Gaps

Purpose:

Make monodocs address whoever is actually reading it — in its own messages, in the chrome around the
generated document, and in the PDF it hands out — and close the two places where this specification
promised something the implementation never delivered. Every item here changes a user-visible
surface, which is why it happens before 1.0 freezes those surfaces rather than after.

Implementation scope:

- Translate the CLI and runtime messages, English by default and Japanese chosen explicitly (25.6)
- Give the generated document a `lang` that sets both `<html lang>` and its UI labels, with
  `html.labels` overriding individual entries (23.4), and reverse the English-only label decision
  recorded in architecture.md
- Implement `monodocs init`, specified in 25.1 from the beginning and never built
- Warn when the machine running the build lacks the fonts the document needs, for PDF output and for
  mermaid `pre-render` alike, instead of baking tofu into the artifact (24.3.3)
- Put page numbers in the PDF (24.5)
- Record Docker as a delivery form that will not be provided (8.3)
- Close the gaps the first outside use of a published release turned up: one rule for unknown keys
  (12.2), an exclude list that adds to the built-in one instead of replacing it (12.3), a single file
  as an input (25.2), and printed tables whose columns follow their contents (24.3.1)
- Give the author a way to set the printed page more or less tightly, which `pdf.margin` never
  reached, with a default set for paper rather than for a screen (24.6)
- Update the documentation site — commands, configuration, and the CI guide — and their Japanese
  mirrors, since every item above changes something the site documents

Completion criteria (this chapter defines the milestone; [status.md](status.md) tracks it as a
checklist, and the two are kept in step):

- `--help` — including the headings Commander generates — and every error and warning read in English
  by default, and in Japanese under `--lang ja` or `MONODOCS_LANG=ja`; the flag wins over the
  environment variable, and an unsupported value is rejected naming the supported ones rather than
  falling back silently
- The catalogue covers every string monodocs itself emits, including the Commander help text reached
  through `configureHelp` / `addHelpText`, and a test fails when a new one is added outside it. A
  message that reaches the user unwrapped from a dependency (a Zod parse error, a Puppeteer stack) is
  out of scope, and the boundary is written down rather than left to be rediscovered
- `lang: ja` produces `<html lang="ja">` and Japanese labels, and the default produces English of
  both, so the document no longer declares one language while displaying another. A tag with no
  shipped table still reaches `<html lang>`, falls back to the English labels, and warns
- Any single label can be replaced through `html.labels`, an unknown key is rejected rather than
  ignored, and the full key set is enumerated in the configuration reference because 1.0 freezes it
- A theme replacing only `template.html` or `style.css` gets the labels; a theme replacing `app.js`
  reads them from `siteDataJson`. The two cases are documented as different guarantees, not as one
- `monodocs init` writes a configuration and a first page that build without editing, and when
  either file already exists it writes neither and names what it found
- A build where a needed font is missing says which characters are at risk and shows a font that
  covers them; a document needing nothing the machine lacks stays silent. `fontCheck: warn | error |
  off` selects the three behaviours, and `error` exits non-zero
- `mermaid.mode: pre-render` is covered by the same check, since it bakes the build machine's fonts
  into the SVG (21.2)
- A generated PDF carries page numbers by default, in a form that needs no translation.
  `pdf.header: false` produces no band at all rather than Chromium's built-in date-and-title header,
  and a replacement fragment renders through Chromium's own classes
- Margins too small for the default footer warn; a custom fragment is documented as unchecked
- `verify-published.yml` exercises the new surface — the message language, `init`, and a PDF whose
  page numbers are actually present — rather than only asserting that a PDF was produced
- The decision not to publish a Docker image is recorded with its reason, as Homebrew / Scoop /
  winget were before it
- An unknown key fails the build wherever it sits, naming the key and the object that holds it. No
  key is checked differently for sitting deeper in the file, and the report is not a JSON dump of the
  validator's issue array
- `sources.exclude` adds to the built-in exclude list rather than replacing it,
  `sources.excludeDefaults: false` drops that list, and `sidebar.exclude` still builds while saying
  where it moved and that it now merges
- `monodocs build ./docs/plan.md` builds that file as a one-page document, reading the configuration
  and resolving links and images from the directory that holds it. A path that is not a source
  monodocs can read says so and names the extensions that work, rather than surfacing an `ENOTDIR`
- A printed table gives each column the width its contents need and still fits inside the page
- `pdf.density` puts the same document on fewer sheets at each step of `relaxed` / `normal` /
  `compact` / `tight`, and the object form starts from a named preset so that adjusting one value
  does not mean copying the rest. The default is set for paper rather than for a screen and saves
  sheets without changing the type size; `relaxed` is the screen setting under a name and emits no
  rules at all. The documentation site shows the four built from one source, as PDFs with their own
  first pages as thumbnails

## v0.11: Page Breaks and the 1.0 Contract

Purpose:

Give the author control of where a printed page ends. A source file already starts a new sheet and
nothing inside a file does, so a document whose sections have to begin on their own sheet — a
specification, a set of regulations, anything handed over on paper — cannot be produced at all, and
neither can the older and simpler "break here". Both are page-setting decisions that belong to the
person writing the document, and both change a surface that 1.0 freezes.

The second half is unrelated to the first, and shares a release with it because 0.11.0 was never
published: the page-break work was merged, and the milestone after it was defined, before anything
reached npm — so the number is still free. Cutting a release now for work that is already in main,
and another for the milestone that follows it, spends two verification cycles
([maintenance.md](maintenance.md)) where one does, and leaves every `(v0.11)` annotation in this
repository naming a version nobody can install. A milestone number and a release number are the same
number here, which is what lets an annotation be read as the release a feature arrived in, and the
milestones after this one move down by one so that they stay the same number.

Make this document true again, and say what 1.0 actually promises before the number is claimed. The
page-break half was specified first and the implementation matched it — while, elsewhere in the same
file, the configuration example had been describing keys the schema does not have, and
architecture.md had been describing a link behaviour the code stopped having. A specification that
is wrong in places nobody checks is worse than a shorter one: every later decision cites it.

The rest of it is the model everything after this milestone needs. Diagnostics are strings today,
which is why `validate` has nothing to give a CI job, and why "add JSON output" is not a small
change but a data model that has to exist first.

Implementation scope:

- Make the page-break marker work in both formats: AsciiDoc's `<<<`, which already reaches the
  output as `<div class="page-break"></div>` and does nothing, and the same element in Markdown,
  recognised as an exact spelling rather than by turning raw HTML back on (24.7)
- Add `pdf.pageBreakLevel`, which breaks before every heading down to a chosen level, with the
  heading that only the page title precedes left alone (24.7)
- Emit both rules from core rather than from the default theme, so replacing `style.css` cannot
  delete them
- Update the syntax specification, the architecture document, and the configuration reference on the
  documentation site, each with its Japanese mirror, since the raw-HTML boundary and the
  configuration surface both change
- Synchronise the specification with the code: the configuration example (12.1), architecture.md's
  cross-file anchor paragraph, and status.md's own summary table, which called the page-break work
  planned after every one of its boxes was ticked
- Make the configuration example a test fixture, so it cannot drift again (12.1)
- Write down what 1.0 freezes and what it does not, including the deprecation shape `sidebar.exclude`
  already follows (12.4)
- Introduce the `Diagnostic` model and stable diagnostic codes (27.3)
- Add `validate --format json`, versioned by its own schema version, and three checks that are
  decidable from what the pipeline already holds (25.5)
- Add `document.version` / `date` / `authors`, reaching the PDF's properties and the branding footer,
  with no timestamp of monodocs' own anywhere in them (13.5)

Completion criteria (this chapter defines the milestone; [status.md](status.md) tracks it as a
checklist, and the two are kept in step):

- `<<<` in AsciiDoc and `<div class="page-break"></div>` in Markdown each start a new sheet in the
  PDF, and `<div style="page-break-after: always"></div>` is accepted as the same marker and
  normalised to the class form
- The Markdown marker is recognised on the mdast `html` node before `remark-rehype`, and the element
  that reaches the output is built by monodocs rather than re-emitted from the input. `<DIV>`, an
  extra class, a second attribute, a self-closing tag, a marker with whitespace between its tags, and
  a marker inside a blockquote, a list item, a table cell, or a heading are all rejected and stay
  dropped, as every other raw HTML in Markdown still is
- `pdf.pageBreakLevel` takes `false` (the default) or 2–6, where the number is the deepest heading
  level that starts a new sheet and h1 is not one, since the file it titles has already broken
- A heading breaks unless nothing renders before it or the only thing that does is the page's h1, so
  a page opening with a title and an introduction still breaks before its first section. Headings
  inside a block carrying `break-inside: avoid` are not candidates
- The headings that break are marked in post-processing with `data-monodocs-pdf-break-before` rather
  than selected in CSS, so the flat body Markdown produces and the `.sect1`–`.sect5` nesting
  Asciidoctor produces are handled by one rule, and a page whose h1 is missing or whose first heading
  is an h3 behaves the same way
- Both rules are emitted by core into the print stylesheet and name `#content` and `.page` alike, so
  a theme replacing `style.css` keeps them; the default `false` emits no heading rule at all, and
  neither rule reaches the screen stylesheet
- A marker immediately followed by a heading that would break does not produce a blank sheet between
  them. Whether Chromium collapses the two forced breaks is measured rather than assumed, and the
  second is suppressed in post-processing if it does not
- The space above a heading that starts a sheet is measured against `pdf.density`, and the rule zeroes
  it only if the measurement shows Chromium keeping it — the same standard 24.6 set for a value that
  reaches the page
- The PDF assertions are page counts read from the produced PDF, the form the density tests already
  use: `h1 → h2 → body → h2` under `pageBreakLevel: 2` comes out as exactly two sheets, which fails
  at one sheet if the feature is dead and at three if the leading-heading rule is wrong, and the same
  document under the default comes out as one
- A test extracts the YAML from 12.1 and runs it through `loadConfig`; the example that ships is one
  monodocs loads without a warning. The twelve phantom keys are gone from it, and the two behaviours
  that were never configurable — GFM and frontmatter always on, safe mode fixed — say so where the
  keys used to be
- architecture.md describes the cross-file anchor behaviour the code has: resolved to the target
  page's prefixed element ID, falling back to the page top with a warning when the anchor does not
  exist. syntax.md already described it, and the two now agree
- 12.4 states, in this document, that a 1.x release does not remove, rename, or redefine a key, a
  command, an option, or a piece of markup that 1.0 accepted; that a default changes only in a major
  release; that additions are allowed in a minor release; and that no key is ever accepted and
  ignored ahead of the release that implements it
- Every error and warning monodocs emits carries a `code` and, where the pipeline knows it, a `path`
  and a position. A test fails when a diagnostic is added without a code
- `monodocs validate --format json` prints an object carrying a schema version and an array of
  diagnostics, and the schema version is documented as the thing to pin. Human output is unchanged
- A skipped heading level, an image with no `alt` attribute, and an unresolved cross-file anchor are
  reported as diagnostics. `alt=""` is not reported, and a test asserts that it is not
- `document.version` / `date` / `authors` reach the PDF's Author, Subject, and Keywords, and the
  branding footer of both HTML and PDF. The same input built twice produces identical bytes, and a
  test asserts it — the build writes no date of its own
- The site's configuration reference and its Japanese mirror carry `document` and the JSON output

---

## v0.12: Input and Routes

Purpose:

Let a document be built from a repository shaped the way repositories are shaped, and stop the
links inside it from dying when a file is renamed. Both are route decisions, which is why they are
one milestone: `README.md` at the root and pages under `docs/` cannot be one document today, and
making them one moves every route in that document — so the mechanism that keeps old links working
has to arrive with it, not after it.

The AsciiDoc half is here for the same reason. `sources.asciidoc.attributes` has been promised since
before 1.0, and the attributes an author wants are the ones that change how a document reads; the
attributes monodocs must refuse are the ones that change where files are read from. That boundary is
the same boundary `include::` and images already depend on, and it turns out to be weaker than
architecture.md claims.

Implementation scope:

- Add `root` and `sources.include`, keeping `input` as the single-directory spelling (12.5)
- Add route aliases in both formats, with the collision, shadowing, and normalisation rules checked
  at build time (15.5)
- Add `sources.asciidoc.attributes` as a classified set — allowed, author-defined, refused, and not
  configurable at all — set as defaults rather than locked (17.5)
- Check the real path of an included file and of an image against the input root, since safe mode
  does not resolve symbolic links, and correct architecture.md's claim that it prevents external
  access (17.5)

Completion criteria:

- `root: .` with `sources.include: ["README.md", "docs/**"]` builds one document from both, resolving
  images, links, and the configuration file against `root`. `sources.exclude` subtracts last
- A configuration with neither `root` nor `include` behaves exactly as it does today, and a test
  builds an existing fixture unchanged to prove it. `input` naming a path outside `root` is an error
  rather than a merge
- `aliases:` in frontmatter and `:sd-aliases:` in AsciiDoc make an old hash route render the page and
  replace the hash with the current route; an anchor survives the substitution
- Two pages claiming one alias is an error; an alias colliding with a real route warns and the real
  route wins; aliases are normalised before any of that is decided. None of them reach the sidebar,
  the search index, or the previous/next order
- `sources.asciidoc.attributes` sets `sectnums` and an author's own attribute; the document's own
  value wins over the configured one; `allow-uri-read`, `docinfo`, `backend`, `data-uri`,
  `imagesdir`, `source-highlighter`, and `sd-*` are refused, naming the attribute and the reason;
  `safe` and `base_dir` are not accepted at all
- An `include::` or an image whose real path resolves outside the input root is refused, naming the
  path it resolved to, and a test uses an actual symbolic link. architecture.md says what safe mode
  does and what this check does

---

## v0.13: The Single-File Budget

Purpose:

Give the author the number that decides whether the document can be delivered. Everything in this
project follows from the output being one file, and nothing in it measures that file — 33.3 names
the risk and `maxInlineSize` judges one image at a time, which is a rule about a part rather than a
fact about the whole. An author learns the size from a mail server rejecting it.

This milestone carries a second half that has nothing to do with the budget, and says so rather than
pretending otherwise, as v0.11 did with the page breaks and the 1.0 contract. `sources.lineBreak`
(12.6) is here because `break`'s AsciiDoc half needs the attribute machinery v0.12 builds and
nothing after it depends on the key, and because the document set this repository publishes is
affected today: `examples/ja` is written one sentence per line and comes out with a space between
every pair of sentences.

Implementation scope:

- Report the output size and an honest breakdown at the end of a build (20.5)
- Add `assets.budget` and `assets.onBudget`, unset by default (20.5)
- Record why images are not re-encoded, so the question is answered rather than reopened (20.5)
- Add `pdf.watermark`, emitted from core so a theme cannot delete it (24.10)
- Add `sources.lineBreak` with `space` (the default), `break`, and `join`, applied inside both
  renderers before the page's text is collected (12.6)

Completion criteria:

- A build prints the output size and a breakdown of embedded images, the inline Mermaid runtime, the
  `siteDataJson` payload, and everything else. The breakdown's parts sum to the file, and a test
  asserts that they do. Shiki has no line, because it leaves no runtime in the output
- The largest embedded image is named with its size, since the breakdown exists to be acted on
- `assets.budget: 10MB` warns when the output exceeds it and `onBudget: error` fails the build.
  Unset, nothing changes, and no existing build starts warning
- Both numbers are the bytes written to disk, measured after the file is complete, not an estimate
  summed while building
- `pdf.watermark: "DRAFT"` prints one line of text diagonally behind the content on every sheet of
  the PDF and of a browser print, and nothing on screen. The text is escaped; a value containing
  markup appears as that text
- The watermark rule is emitted by core into the print stylesheet, and a document built with a theme
  that replaces `style.css` still carries it
- The decision not to re-encode images is recorded with its reasons — the native dependency the
  binary cannot take, the Chromium dependency an HTML build must not acquire, and the reproducibility
  it would cost — as Docker and Homebrew were before it
- `sources.lineBreak: break` turns a newline inside a paragraph into a `<br>` in both formats, and an
  AsciiDoc document that writes `:hardbreaks-option!:` still wins, because the attribute is soft-set
  with the `@` suffix 17.5 requires
- `sources.lineBreak: join` removes the newline between two characters of East Asian Width F, W, or H
  where neither is Hangul, leaving it alone everywhere else and inside `pre` and `code` entirely. The
  ranges are generated from the Unicode data file, the Unicode version is recorded, and a test
  asserts the table still matches it
- The default `space` produces the bytes the previous release produced, and a test builds an existing
  fixture unchanged to prove it
- `page.text` and the HTML agree under all three values, so a search result cannot point at text the
  page does not contain

---

## v0.14: Setting the Printed Page

Purpose:

Finish the document that is handed over on paper. v0.10 gave it page numbers and a density, v0.11
let the author decide where a sheet ends, and what is still missing is what a specification is: a
cover that says what version it is, sections that can be cited by number, and a table of contents
that says which page to turn to. The three arrive together because they depend on each other — a
table of contents lists numbered sections, and it counts sheets that a cover has shifted.

This milestone also answers the math question rather than repeating a reason that has expired.

Implementation scope:

- Add `numbering.sections`, decided over the whole document in the shared `Page` model rather than
  per file in either renderer (19.1)
- Add `pdf.cover.enabled`, generating a cover from `document` and starting the numbering after it
  (24.8)
- Add `pdf.toc`, produced by a verified two-pass render that fails rather than printing a number it
  has not checked (24.9)
- Measure whether math through KaTeX's MathML output is good enough to adopt, and record the answer
  either way (6.4)

Completion criteria:

- `numbering.sections: 3` numbers headings continuously across the whole document, in the sidebar
  order, with a directory contributing a level and `h1` carrying the page's own number. Routes, page
  IDs, and heading IDs are unchanged, and a test asserts that they are
- The number is an element inside the heading, appears in the sidebar and the in-page table of
  contents, and does not outweigh a word in search. `:sectnums:` in a document is refused while
  numbering is on, naming the configuration key
- `pdf.cover.enabled: true` produces a first sheet carrying the title, version, date, and authors
  from `document`, with no page number on it, and the following sheet numbered 1. The PDF's page
  labels agree with the printed numbers
- Whether the footer can be suppressed on one sheet in a single render is measured; if it cannot,
  the cover is produced as its own PDF and concatenated, on the pass that already rewrites the
  finished bytes
- `pdf.toc.enabled: true` prints a table of contents whose page numbers are read from the delivered
  PDF, not from the first pass. After substitution the destinations are read again and compared to
  the numbers printed; a mismatch retries within a fixed bound, and a document that does not converge
  fails with a message saying so
- The placeholder reserves the width of the largest possible page number and the column is set in
  tabular figures, so that a number growing a digit cannot move the page it points at
- The second render's cost is measured on a document of a hundred-odd sheets, on Linux and Windows,
  with CJK text and with client-mode Mermaid, and the numbers are recorded. `pdf.toc` stays off by
  default
- A document with `pageBreakLevel`, a cover, a table of contents, and numbering on comes out with the
  four agreeing: the number in the table of contents is the sheet the section starts on
- Running headers are not implemented, and 24.9 records why the two-pass machinery does not reach
  them
- A sample document of real formulas is built to HTML and PDF on both platforms with KaTeX's MathML
  output, and either math becomes a 1.x feature with a notation chosen in the open, or syntax.md
  records the measured reason for the limitation in place of the dependency argument that no longer
  holds

---

## 1.0

Purpose:

Claim the number, on the terms 12.4 wrote down. 1.0 is not a feature milestone: it is the release
that says the surfaces are stable, which is only worth saying once everything that would have
changed them has been done.

What it contains:

- The frozen surfaces enumerated in one place: every configuration key with its default, every
  command and option, and the markup monodocs recognises beyond CommonMark, GFM, and AsciiDoc
- The diagnostics JSON schema version at 1, documented as the thing a CI job pins
- `sidebar.exclude` — deprecated since v0.10 — removed, as the first exercise of the deprecation
  shape 12.4 defines
- Documentation, in both languages, that describes the tool as it is: no key in the reference that
  the schema does not have, and no behaviour in architecture.md that the code does not do. v0.11
  makes this true; 1.0 is where it is checked again, because that is what the number claims

---

## 30. Initial Implementation Tasks

### 30.1 Create Repository

```bash
mkdir monodocs
cd monodocs
pnpm init
```

### 30.2 Add Basic Dependencies

```bash
pnpm add -D typescript tsx vitest
pnpm add commander yaml zod
```

### 30.3 Add Markdown-related

```bash
pnpm add unified remark-parse remark-gfm remark-frontmatter remark-rehype rehype-stringify
```

### 30.4 Create workspace

```text
packages/
  core/
  cli/
```

### 30.5 The First core API

```ts
export async function buildSite(options: BuildOptions): Promise<BuildResult>;
```

```ts
export type BuildOptions = {
  inputDir?: string;
  outputFile?: string;
  configFile?: string;
  format?: "html" | "pdf" | "both";
};
```

### 30.6 Functions to Implement First

```text
loadConfig()
scanSourceFiles()
detectFormat()
readSourceFiles()
extractMarkdownMeta()
renderMarkdown()
buildPages()
buildSidebar()
renderSingleHtml()
writeOutput()
```

### 30.7 The First CLI

```bash
monodocs build ./docs -o ./dist/docs.html
```

---

## 31. Sample Configurations

### 31.1 Markdown Only

```text
examples/basic-markdown/
  docs/
    index.md
    setup/
      install.md
      config.md
```

### 31.2 AsciiDoc Only

```text
examples/basic-asciidoc/
  docs/
    index.adoc
    setup/
      install.adoc
      config.adoc
```

### 31.3 Mixed

```text
examples/mixed/
  docs/
    index.md
    setup/
      install.adoc
      config.md
    guide/
      usage.adoc
      faq.md
```

---

## 32. Definition of the MVP

The first MVP does not expand too far into PDF or AsciiDoc, and is narrowed down to the following.

```text
v0.1 MVP:
- TypeScript monorepo
- core + cli
- Read multiple Markdown files
- Extract H1 title
- Support GFM
- Folder-structure sidebar
- Output single HTML
- Pseudo-page switching via hash route
```

However, in anticipation of future AsciiDoc support, the internal design is designed with the Source Renderer Architecture in mind from the start.

That is, in v0.1 only the MarkdownRenderer is implemented, and the AsciiDocRenderer is added in v0.2.

---

## 33. Risks and Countermeasures

### 33.1 Link Conversion for Markdown / AsciiDoc Is Complex

Countermeasures:

- Support only file-level links at first
- Defer heading links
- Turn unresolvable links into warnings
- Detect them with the validate command

### 33.2 AsciiDoc's Feature Set Is Too Broad

Countermeasures:

- Initially leave it to Asciidoctor.js's standard conversion
- Leave `include` to Asciidoctor
- Exclude `partials` / those starting with `_` from page generation targets
- Defer AsciiDoc extensions

### 33.3 The HTML Becomes Huge

Countermeasures:

- Make image embedding switchable ON / OFF via configuration
- Set maxInlineSize
- Allow choosing the behavior on size excess from warn / error / external

### 33.4 Compatibility Between Mermaid and PDF

Countermeasures:

- Support both client and pre-render modes
- Wait for client-mode rendering to complete during PDF output
- Use pre-render mode to embed diagrams as SVG at build time when JavaScript-free output is required

### 33.5 Full Compatibility with GitHub Flavored Markdown Is Difficult

Countermeasures:

- Do not describe it as "fully GitHub-compatible"
- Describe it as "GFM supported"
- Base it on remark-gfm

### 33.6 Double Implementation Occurs in the VS Code Extension

Countermeasures:

- Confine the conversion logic to core
- Make the VS Code extension only call core

---

## 34. Priorities at the Start of Development

The initial implementation order is as follows.

```text
1. Initialize the monorepo
2. Create the core package
3. Create the cli package
4. Implement MarkdownRenderer
5. Create the Page model
6. Generate the sidebar
7. Create the single HTML template
8. hash route switching
9. Create the basic-markdown example
10. Add basic tests with vitest
```

At this stage, first establish the core of `monodocs`.

After that,

```text
11. AsciiDocRenderer
12. mixed example
13. link rewrite
14. image embed
15. Mermaid
16. PDF
```

proceed in this order.

---

## 35. Final Destination

Ultimately, the goal is to be able to use it as follows.

```bash
monodocs build ./docs --format html -o ./dist/docs.html
monodocs build ./docs --format pdf -o ./dist/docs.pdf
monodocs serve
monodocs validate
```

The input is a mix of Markdown / AsciiDoc.

```text
docs/
  index.md
  overview.adoc
  setup/
    install.md
    config.adoc
  guide/
    usage.md
```

The output is a single HTML or PDF.

```text
dist/
  docs.html
  docs.pdf
```

`monodocs` is a tool for converting documentation managed across multiple files into a single, easy-to-distribute file.

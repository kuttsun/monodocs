# monodocs ROADMAP

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
monodocs build ./docs -o ./dist/manual.html
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
  manual.html
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

Candidate npm package name:

```text
@your-org/monodocs
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

---

## 7. Output Formats

### 7.1 HTML

The first output format to be supported.

```bash
monodocs build ./docs -o ./dist/manual.html
```

Or:

```bash
monodocs build ./docs --format html -o ./dist/manual.html
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
monodocs build ./docs --format pdf -o ./dist/manual.pdf
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
monodocs build ./docs -o ./dist/manual.html
```

### 8.2 npm Package

Global install:

```bash
npm install -g @your-org/monodocs
```

One-off execution:

```bash
npx @your-org/monodocs build ./docs -o ./dist/manual.html
```

Project-local introduction:

```bash
npm install -D @your-org/monodocs
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

For CI and in-house environments.

```bash
docker run --rm \
  -v "$PWD:/work" \
  monodocs/monodocs build /work/docs -o /work/dist/manual.html
```

### 8.4 GitHub Actions

```yaml
- uses: your-org/monodocs-action@v1
  with:
    input: docs
    output: dist/manual.html
```

### 8.5 Standalone Binary

To be provided in the future.

```text
monodocs-windows-x64.exe
monodocs-linux-x64
monodocs-macos-x64
monodocs-macos-arm64
```

### 8.6 VS Code Extension

To be provided after the core / CLI stabilizes.

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

```yaml
title: "Internal Documentation"

input: "./docs"

output:
  format: "html"
  path: "./dist/manual.html"

sources:
  markdown:
    enabled: true
    extensions:
      - ".md"
      - ".markdown"
    gfm: true
    frontmatter: true

  asciidoc:
    enabled: true
    extensions:
      - ".adoc"
      - ".asciidoc"
      - ".asc"
    safeMode: "safe"
    attributes:
      sectnums: true
      icons: font

sidebar:
  mode: "folder"
  # Source for obtaining titles. "heading" (default) = frontmatter → heading (H1 / = Title) → filename.
  # "filename" = use the filename as the title even if there is a heading (an explicit title always takes top priority).
  titleFrom: "heading"
  collapsible: true
  # Collapse directories deeper than this level by default (it only folds them without hiding, so reachability is not lost).
  # 0 = fold all directories / unspecified = no collapsing (fully expanded). The top level is depth 1.
  collapseDepth: 2
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
  exclude:
    - "_partials/**"
    - "partials/**"
    - "includes/**"

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

html:
  selfContained: true
  routeMode: "hash"
  theme: "default"
  # Maximum width of the body area. e.g.: "860px" / "1100px" / "72rem" / full
  contentWidth: "860px"
  darkMode: true

pdf:
  enabled: false
  pageSize: "A4"
  margin:
    top: "20mm"
    right: "15mm"
    bottom: "20mm"
    left: "15mm"
  printBackground: true

search:
  enabled: true
```

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

Allow explicit specification via the configuration file.

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
manual.html#/
manual.html#/setup/install
manual.html#/setup/config
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
<div class="mermaid">
graph TD
  A --> B
</div>
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

Heading links are highly difficult, so they will be supported in stages.

Initial support:

```text
Prioritize file-level links
```

Future support:

```text
Accurately convert file + heading ID
```

Example:

```md
[Authentication Settings](./config.md#authentication-settings)
```

Output candidate:

```html
<a href="#/setup/config?heading=setup-config-authentication-settings"
  >Authentication Settings</a
>
```

Or:

```html
<a href="#setup-config-authentication-settings">Authentication Settings</a>
```

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

Search index example:

```js
window.__SEARCH_INDEX__ = [
  {
    route: "/setup/install",
    title: "Installation",
    text: "How to install...",
  },
];
```

Search targets:

- title
- headings
- plain text

### 22.2 Future Implementation

Use something like `minisearch`.

Candidates for support:

- Scoring
- Multiple keywords
- Highlighting
- Improved Japanese search

---

## 23. HTML Template

### 23.1 Basic Structure

```text
<!doctype html>
<html lang="ja">
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

      <main id="main">{{pages}}</main>
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
monodocs build ./docs --format pdf -o ./dist/manual.pdf
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

### 24.4 Display Mode for PDF

Separately from the pseudo-page display of the HTML, a print mode that lays out all pages vertically is provided for PDF.

```text
interactive mode:
  display one page at a time via hash route

print mode:
  expand all pages vertically
```

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

### 25.2 build

```bash
monodocs build
```

Input/output specification:

```bash
monodocs build ./docs -o ./dist/manual.html
```

Format specification:

```bash
monodocs build ./docs --format html -o ./dist/manual.html
monodocs build ./docs --format pdf -o ./dist/manual.pdf
monodocs build ./docs --format both -o ./dist/
```

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

---

## 26. VS Code Extension

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
  "monodocs.outputFile": "dist/manual.html",
  "monodocs.preview.autoRefresh": true
}
```

### 26.3 Implementation Policy

Do not write conversion logic inside the VS Code extension.

```text
vscode-extension
  ↓
@your-org/monodocs-core
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
monodocs build tests/fixtures/mixed-basic/docs -o tmp/manual.html
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

- `monodocs build ./docs -o ./dist/manual.html` works
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
(`pipeline/renderPdf.ts`). `--format both` treats `-o` as a directory and outputs `manual.html` / `manual.pdf`. For client mode Mermaid,
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

- `monodocs build ./docs --format pdf -o ./dist/manual.pdf` works
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
- Create a GitHub Action
- GitLab CI sample
- Improve the README
- Improve examples
- Decide on a versioning policy

Completion criteria:

- Can be installed from npm
- Can generate HTML / PDF in GitHub Actions
- Can be introduced by looking at a sample project

A Docker image for users will not be provided. The existing dedicated Docker image used in the development/test environment
will continue to be maintained.

---

## v0.7: VS Code Extension

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

- Mermaid pre-render mode
- Search improvements
- Improved Japanese search
- Custom themes
- Full support for custom sidebars
- Standalone binary distribution
- Consider Homebrew / Scoop / winget support
- HTML / PDF output quality improvements

Completion criteria:

- Mermaid can be pre-rendered as SVG
- Search is practical even for large-scale documents
- There is a distributable that can run without Node.js
- Themes can be switched

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
monodocs build ./docs -o ./dist/manual.html
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

- Initially client mode
- Add waiting for rendering completion during PDF output
- Implement pre-render mode in the future

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
monodocs build ./docs --format html -o ./dist/manual.html
monodocs build ./docs --format pdf -o ./dist/manual.pdf
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
  manual.html
  manual.pdf
```

`monodocs` is a tool for converting documentation managed across multiple files into a single, easy-to-distribute file.

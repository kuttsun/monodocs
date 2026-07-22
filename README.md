# monodocs

[日本語](README.ja.md)

`monodocs` is a CLI tool that generates a **single HTML or PDF document** from a directory of Markdown and AsciiDoc files. It lets you maintain documentation as multiple source files while distributing it as one self-contained file.

> **Status: v0.5 implemented** — HTML/PDF output, mixed Markdown and AsciiDoc sources, link rewriting, embedded images, Mermaid, metadata, validation, full-text search, page tables of contents, previous/next navigation, dark mode, print layout, watch mode, and live preview are available. See [the implementation status](docs/status.md) for details.

## Features

- Combines multiple Markdown and AsciiDoc files into one HTML document
- Generates a collapsible sidebar from the directory structure and document headings
- Rewrites cross-file links and AsciiDoc xrefs into hash routes
- Embeds images as data URIs for self-contained output
- Supports Mermaid in client or pre-render mode
- Highlights code with Shiki and follows the selected color scheme
- Reads order, visibility, and descriptions from frontmatter or `:sd-*:` attributes
- Provides full-text search, an in-page table of contents, and previous/next navigation
- Supports dark mode and a print layout that expands every page
- Lets readers toggle the main content between a readable default width and the full available width
- Generates PDF files with bookmarks and inter-page links through Chromium
- Rebuilds on changes with `watch` and provides live reload with `serve`
- Detects broken links and missing images with `validate`
- Supports GitHub Flavored Markdown

> Mermaid uses the self-contained `runtime: inline` mode by default. Use `runtime: cdn` for smaller HTML that may access the network, or `mode: pre-render` to generate SVG during the build. PDF output and Mermaid pre-rendering require Chromium.

> **Only process trusted input.** AsciiDoc can emit raw HTML, so converting untrusted AsciiDoc may result in script execution when the generated document is opened. See the [security boundaries](docs/architecture.md#security-boundaries).

`monodocs` is a lightweight generator focused on single-file distribution; it is not intended to replace Pandoc.

## Supported environments

The initial v0.6 distribution is an npm package for Node.js 22 or later. Linux x64 and Windows x64 are the initial supported platforms. PDF output and Mermaid pre-rendering use a system-installed Chromium or Google Chrome; `monodocs` does not download a browser automatically.

| Item                            | Initial support             |
| ------------------------------- | --------------------------- |
| Distribution                    | npm (`npm install` / `npx`) |
| Node.js                         | 22 or later                 |
| HTML / validate / watch / serve | Linux x64, Windows x64      |
| PDF / pre-render                | Requires system Chromium    |
| Standalone SEA binary           | Outside the v0.6 scope      |

Set `PUPPETEER_EXECUTABLE_PATH` when the browser cannot be discovered automatically. Windows users currently need to set it explicitly for PDF output and Mermaid pre-rendering.

## Installation

v0.6.0-beta.1 is planned for the npm `next` tag:

```bash
npm install -g monodocs@next
npx monodocs@next build ./docs -o ./dist/manual.html
```

Remove `@next` after the stable release. Until the beta is announced, use the repository's development Docker image as described in the [development guide](docs/development.md).

## Usage

Markdown and AsciiDoc files may be mixed. The input directory structure becomes the sidebar structure.

```text
docs/
  index.md
  setup/
    install.adoc
    config.md
  guide/
    usage.md
```

Build or validate the documentation:

```bash
monodocs build ./docs -o ./dist/manual.html
monodocs build ./docs --format pdf -o ./dist/manual.pdf
monodocs build ./docs --format both -o ./dist/
monodocs validate ./docs
```

Preview while editing:

```bash
monodocs watch ./docs -o ./dist/manual.html
monodocs serve ./docs
monodocs serve ./docs --open
```

`serve` listens on `http://127.0.0.1:4173/` by default. With `--format both`, an output directory contains `manual.html` and `manual.pdf`.

## Local showcase

The repository provides English and Japanese showcases under `examples/en` and `examples/ja`. Docker is the only host requirement:

```bash
scripts/app-serve.sh
```

Open `http://localhost:4173/`. Use `Ctrl+C` to stop the server. To select another port:

```bash
MONODOCS_PORT=8080 scripts/app-serve.sh --port 8080
```

The showcase covers mixed Markdown/AsciiDoc input, sidebar behavior, search, the table of contents, navigation, dark mode, the persistent content-width toggle, code highlighting, Mermaid, embedded images, rewritten links, and print layout. See the [development guide](docs/development.md) for individual build and test commands.

## Configuration

Place `monodocs.config.yml` in the input directory, or pass a file with `--config`:

```yaml
title: "Team Documentation"
input: "./docs"
output:
  format: "html"
  path: "./dist/manual.html"
sidebar:
  exclude:
    - "_partials/**"
  titleFrom: "heading"
  titleTransform:
    page:
      type: "none"
    directory:
      type: "none"
sources:
  markdown:
    extensions: [".md", ".markdown"]
  asciidoc:
    extensions: [".adoc", ".asciidoc", ".asc"]
assets:
  embedImages: true
  maxInlineSize: "5MB"
  onLargeImage: "warn"
mermaid:
  enabled: true
  mode: "client"
  runtime: "inline"
highlight:
  enabled: true
html:
  theme: "default"
  contentWidth: "860px"
  contentWidthToggle: true # false hides the reader-facing width toggle
  contentWidthDefault: "standard" # standard | wide (used until the reader chooses)
```

See the [roadmap and specification](docs/roadmap.md) for the complete configuration model.

## Documentation

| Document                  | English                         | 日本語                            |
| ------------------------- | ------------------------------- | --------------------------------- |
| Development guide         | [English](docs/development.md)  | [日本語](docs/ja/development.md)  |
| Architecture              | [English](docs/architecture.md) | [日本語](docs/ja/architecture.md) |
| Technology stack          | [English](docs/tech-stack.md)   | [日本語](docs/ja/tech-stack.md)   |
| Roadmap and specification | [English](docs/roadmap.md)      | [日本語](docs/ja/roadmap.md)      |
| Supported syntax          | [English](docs/syntax.md)       | [日本語](docs/ja/syntax.md)       |
| Implementation status     | [English](docs/status.md)       | [日本語](docs/ja/status.md)       |
| Testing                   | [English](docs/testing.md)      | [日本語](docs/ja/testing.md)      |

See [CONTRIBUTING.md](CONTRIBUTING.md) before contributing and [SECURITY.md](SECURITY.md) to report a vulnerability privately.

## License

[MIT License](LICENSE) © 2026 kuttsun

The npm bundle includes `dist/THIRD-PARTY-NOTICES.txt`, generated during `pnpm bundle`, for bundled third-party dependencies.

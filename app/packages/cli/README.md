# monodocs

[日本語](README.ja.md)

Generate a single self-contained HTML or PDF document from a directory of
Markdown and AsciiDoc files.

## Requirements

- Node.js 22.12.0 or later
- Chromium or Google Chrome for PDF output and Mermaid pre-rendering. Set
  `PUPPETEER_EXECUTABLE_PATH` when the browser is not discoverable on the
  system path.

The npm package supports HTML and PDF output as well as Mermaid client and
pre-render modes. A standalone binary that needs no Node.js is attached to every
[GitHub Release](https://github.com/kuttsun/monodocs/releases) for Linux x64 and
Windows x64; it cannot produce PDFs or pre-render Mermaid, because both drive a
headless browser that is deliberately left out of the bundle.

## Installation

```bash
npm install -g monodocs
```

Or run it without a global installation:

```bash
npx monodocs build ./docs -o ./dist/docs.html
```

Untagged `monodocs` is the latest stable version. Prereleases are published
under the `next` tag (`npm install -g monodocs@next`).

## Usage

```bash
monodocs init
monodocs build ./docs -o ./dist/docs.html
monodocs build ./docs --format pdf -o ./dist/docs.pdf
monodocs build ./docs --format both -o ./dist/
monodocs validate ./docs
monodocs serve ./docs
```

For configuration, supported syntax, and known limitations, see the project
documentation at https://github.com/kuttsun/monodocs.

## License

MIT

The bundled third-party notices are in `THIRD-PARTY-NOTICES.txt`. The Mermaid runtime monodocs embeds
contains `elkjs` under the EPL-2.0 (with parts of EMF under the EPL-1.0), a few CC BY-SA snippets, and a
few pieces of code whose source states no license; HTML built with the inline runtime embeds them with
their notices, and the content of your documents is unaffected. See
https://kuttsun.github.io/monodocs/docs/license.

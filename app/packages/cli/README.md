# monodocs

[日本語](README.ja.md)

Generate a single self-contained HTML or PDF document from a directory of
Markdown and AsciiDoc files.

## Requirements

- Node.js 22 or later
- Chromium or Google Chrome for PDF output and Mermaid pre-rendering. Set
  `PUPPETEER_EXECUTABLE_PATH` when the browser is not discoverable on the
  system path.

The npm package supports HTML and PDF output as well as Mermaid client and
pre-render modes. The standalone SEA binary is a separate future distribution.

## Installation

```bash
npm install -g monodocs@next
```

Or run it without a global installation:

```bash
npx monodocs@next build ./docs -o ./dist/manual.html
```

The `next` tag is used during the v0.6 prerelease. After the stable release,
installing `monodocs` without a tag will select the stable version.

## Usage

```bash
monodocs build ./docs -o ./dist/manual.html
monodocs build ./docs --format pdf -o ./dist/manual.pdf
monodocs build ./docs --format both -o ./dist/
monodocs validate ./docs
monodocs serve ./docs
```

For configuration, supported syntax, and known limitations, see the project
documentation at https://github.com/kuttsun/monodocs.

## License

MIT

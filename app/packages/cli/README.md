# monodocs

Generate a single self-contained HTML or PDF document from a directory of
Markdown and AsciiDoc files.

## Requirements

- Node.js 22 or later
- Chromium or Google Chrome for PDF output and Mermaid pre-rendering. Set
  `PUPPETEER_EXECUTABLE_PATH` when the browser is not discoverable on the
  system path.

## Installation

```bash
npm install -g monodocs
```

Or run it without a global installation:

```bash
npx monodocs build ./docs -o ./dist/manual.html
```

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

---
title: PDF output
order: 2
---

# PDF output

`monodocs` can also produce a **PDF via the generated single HTML**. You keep your input
split across files while shipping a single deliverable — either HTML or PDF.

```bash
monodocs build examples/en --format pdf  -o dist/showcase.pdf   # PDF only
monodocs build examples/en --format both -o dist/showcase       # both HTML and PDF
```

- `--format both` treats `-o` as a **directory** and writes `manual.html` and `manual.pdf`
  inside it.
- Internally a headless Chromium opens the single HTML and renders it with the print
  layout (all pages expanded vertically). **This page itself can be part of the PDF.**

## What the PDF includes

- **Bookmarks (outline)**: the same **folder → page** hierarchy as the left sidebar in
  HTML. Jump to any page from the viewer's bookmarks panel.
- **In-content links**: cross-page links, footnotes, and heading anchors remain clickable
  inside the PDF.
- **Images**: embedded as data URIs, so the PDF is self-contained (no external files).
- **Code highlighting / diagrams / tables / alerts**: rendered the same as in HTML.
- **Page-break care**: alerts, figures, and code blocks avoid splitting across pages
  where possible.

> [!NOTE]
> The dark/light toggle is an HTML feature. PDFs are produced in the light print color scheme.

## Configuration (`monodocs.config.yml`)

```yaml
pdf:
  pageSize: "A4" # A4 / Letter, etc.
  margin:
    top: "20mm"
    right: "15mm"
    bottom: "20mm"
    left: "15mm"
  printBackground: true # print background colors / images
  bookmarks: true # attach bookmarks (sidebar structure)
```

## Runtime requirements

> [!IMPORTANT]
> PDF output uses a headless Chromium, so **Chromium must be available** in the runtime
> environment. PDFs are also drawn with the **system fonts of that environment**, so if a
> font for the characters used in the body (CJK, emoji, …) is missing, they render as tofu
> (□ / ☒). The dev image bundles Japanese (CJK) and emoji fonts.

> [!WARNING]
> The bundled CLI (single `.cjs` / single executable) cannot produce PDFs because it does
> not ship `puppeteer-core`. Use the package-installed version for PDF output.

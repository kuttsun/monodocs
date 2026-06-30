---
title: Showcase
order: 1
---

# monodocs Showcase

A sample that gathers monodocs' supported syntax and features into **a single site**.
Open each category from the folders in the left sidebar.

Every syntax page shows the **source (raw Markdown / AsciiDoc)** first, then the
**rendered output (HTML)** below it, so the correspondence between markup and rendering is clear at a glance.

- **Markdown (GFM)**: [Markdown samples](markdown/index.md)
- **AsciiDoc**: [AsciiDoc samples](asciidoc/index.adoc)
- **Mixed (same folder)**: [Markdown / AsciiDoc mixed](mixed/index.md)

The 2nd and 3rd are links from Markdown to AsciiDoc pages. Cross-format links are
also converted into hash routes within the single HTML (mixed support).

## Build / preview

```bash
monodocs build examples/en -o dist/showcase.html
monodocs serve examples/en            # http://127.0.0.1:4173/
```

## Features you can check on this site

- Full-text search / in-page table of contents (scroll-synced) / prev–next navigation
- Dark mode / sidebar collapse & auto-expand
- Code highlighting (shiki) / Mermaid diagrams
- Image data URI embedding / cross-file links & AsciiDoc xref / footnotes
- Tables, code, images, and diagrams wider than the body width ([Markdown](markdown/wide-content.md) / [AsciiDoc](asciidoc/wide-content.adoc))
- Full vertical expansion of all pages when printing

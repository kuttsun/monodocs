# Supported Syntax and Limitations

[日本語](ja/syntax.md)

`monodocs` processes Markdown and AsciiDoc with their respective dedicated renderers, normalizes them into a common `Page` model, and then bundles them into a **single HTML** file ([roadmap.md](roadmap.md) Chapter 11). This document specifies the supported syntax as well as the **syntax that cannot be supported / is intentionally restricted due to the need to unify multiple files into one HTML**.

- Markdown: [unified](https://unifiedjs.com/) / remark / rehype (CommonMark + GitHub Flavored Markdown)
- AsciiDoc: standard conversion via [Asciidoctor.js](https://docs.asciidoctor.org/asciidoctor.js/latest/)

There are `examples/ja/` (Japanese) / `examples/en/` (English) that bundle samples covering each syntax into a single site (for display verification; organized into `markdown/` (GFM) / `asciidoc/` / `mixed/` folders):

```bash
monodocs serve examples/ja
```

## Supported Markdown Syntax

In addition to CommonMark, GitHub Flavored Markdown is enabled via `remark-gfm`.

- Headings (`#` to `######`), paragraphs, line breaks
- Emphasis (`*em*` / `**strong**`), inline code, links, images
- Lists (ordered / unordered), nesting, **task lists** (`- [ ]` / `- [x]`)
- Blockquotes, horizontal rules, **tables (GFM tables)**, **strikethrough** (`~~text~~`), **autolinks**
- **Alerts (GitHub alerts)**: `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]`.
  Displayed with the same structure and color scheme as AsciiDoc admonitions
  ([cross-format specification](#common-specification-for-single-html-bundling-cross-format))
- Fenced code blocks (triple backticks with an optional language identifier). Syntax highlighted with shiki
  (dual theme, dark mode support)
- **Footnotes** (`[^1]`). IDs are prefixed with the page id so they don't collide within the single HTML
- YAML frontmatter (`---`). Reads `title` / `order` / `hidden` / `description` ([roadmap.md](roadmap.md) Chapter 13)
- ` ```mermaid ` code blocks → Mermaid diagrams (`mermaid.mode`: `client` default / `pre-render` = SVG-rendered at build time)
- Images (`![alt](path)`) → the actual file under the input is embedded as a data URI

## Supported AsciiDoc Syntax

Because conversion is delegated to Asciidoctor.js's standard conversion, most AsciiDoc syntax can be used as is.

- Document title (`= Title`), section headings (`==` and beyond), paragraphs, line breaks
- Lists (ordered / unordered / **description lists** / checklists), nesting, continuation lines
- Inline formatting such as emphasis and monospace, links, cross-references
- Tables, **admonitions** (NOTE / TIP / IMPORTANT / WARNING / CAUTION). Normalized to the
  same structure and color scheme as Markdown's GFM alerts
  ([cross-format specification](#common-specification-for-single-html-bundling-cross-format))
- Source blocks (`[source,lang]`, highlighted with shiki), literal / listing / example / sidebar / quote / verse blocks
- Callouts, `kbd:` / `btn:` / `menu:` macros
- Image macros (`image::path[]` / `image:path[]`) → data URI embedding
- `include::[]` (jailed under the input file's directory in safe mode)
- Document attributes, `:sd-title:` / `:sd-order:` / `:sd-hidden:` / `:sd-description:` ([roadmap.md](roadmap.md) Chapter 13)
- `[source,mermaid]` blocks → Mermaid diagrams (`mermaid.mode`: `client` default / `pre-render` = SVG-rendered at build time)
- `xref:` within the same document / internal anchors (IDs are prefixed to keep them working)
- Footnotes (`footnote:[]`). IDs are prefixed with the page id

## Common Specification for Single-HTML Bundling (Cross-Format)

To bundle multiple files into a single file, the following normalization is applied to the output of both formats.

- **Element ID prefixing**: All element IDs are rewritten to `{page-id}-{original-ID}`. This applies not only to headings but also to auto-generated IDs such as footnotes, preventing ID collisions across pages ([sources/prefixIds.ts](../app/packages/core/src/sources/prefixIds.ts)).
- **Routing**: A route is generated from the relative path with the extension removed (`index` → `/`), and within the single HTML, pseudo page switching is done via hash routes (`#/setup/install`).
- **Inter-file link conversion**: Markdown `.md` / `.adoc` links, AsciiDoc `xref:`, and links equivalent to the converted `.html` are converted to `#/route` (hash routes).
- **In-page anchors**: `#id` (a hash not starting with `/`) is treated as an in-page anchor, displaying the page containing the target element and scrolling to it. This works for footnotes, internal references, and direct URLs (`manual.html#id`).
- **Unifying admonitions / alerts**: Markdown GFM alerts (`> [!NOTE]`, etc.) and AsciiDoc admonitions (the `.admonitionblock` in Asciidoctor output) are normalized in postprocess into a common `<div class="admonition admonition-TYPE">` structure. Since the 5 types (NOTE / TIP / IMPORTANT / WARNING / CAUTION) match across both formats, a single set of CSS and colors is shared ([postprocess.ts](../app/packages/core/src/pipeline/postprocess.ts)).

## Limitations / Unsupported (with Reasons)

Due to the need to unify multiple formats into a single HTML, or for dependency / safety reasons, the following are not supported / are restricted.

| Syntax / Feature                                                                                                              | Status                                  | Reason                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw HTML in Markdown (inline / block)                                                                                         | **Unsupported** (not output)            | For safety (XSS avoidance) and consistency of mixed output, it is dropped by remark-rehype's default. If you want to embed HTML, use AsciiDoc's passthrough                                                                                                                                                                                                                         |
| Heading anchors in inter-file links (`other.md#sec` / `xref:other.adoc#sec`)                                                  | **Restricted** (to the top of the page) | Link conversion resolves only down to the file level; the anchor part is dropped with a warning. Conversion that accurately jumps to a heading in another file is not supported ([roadmap.md](roadmap.md) 18.4, future work)                                                                                                                                                        |
| Code highlighting (shiki)                                                                                                     | **Supported**                           | Can be disabled with `highlight.enabled: false`. Blocks with no language specified and unsupported languages are shown as plain text                                                                                                                                                                                                                                                |
| Math (Markdown `$$...$$` / AsciiDoc `stem` / asciimath / latexmath)                                                           | **Unsupported**                         | To keep the HTML self-contained, the policy is not to introduce a MathJax / KaTeX dependency                                                                                                                                                                                                                                                                                        |
| Markdown extended syntax (definition lists / emoji shortcodes `:smile:` / `==marker==` / superscript `^x^` / subscript `~x~`) | **Unsupported**                         | Outside the scope of CommonMark / GFM. If equivalent expression is needed, use the AsciiDoc side                                                                                                                                                                                                                                                                                    |
| AsciiDoc per-document table of contents (`:toc:`)                                                                             | **Disabled**                            | Since the single HTML uses a common "in-page table of contents (right column)," per-document TOCs are not output                                                                                                                                                                                                                                                                    |
| AsciiDoc icons (`:icons: font`)                                                                                               | **Restricted** (text display)           | To avoid an external dependency on Font Awesome, admonitions are displayed with label text + color coding (prioritizing self-containment)                                                                                                                                                                                                                                           |
| Mermaid on unvisited pages during browser printing                                                                            | **Restricted** (client mode only)       | Since Mermaid in client mode renders on display, browser printing (Ctrl+P) may leave diagrams on unvisited pages unrendered. Using `mermaid.mode: pre-render` renders them to SVG at build time so all diagrams appear even in print (theme is fixed at build time). monodocs PDF generation expands all pages and waits for client-mode Mermaid rendering before producing the PDF |
| PDF output (`--format pdf` / `both`)                                                                                          | **Supported** (v0.5)                    | Generates a PDF from the single HTML via headless Chromium. Chromium must be available in the runtime environment, and PDF output is unavailable in the bundled CLI                                                                                                                                                                                                                 |

> Input is assumed to be trusted (self/team-managed) documentation. In particular, AsciiDoc can output
> raw HTML via passthrough and embeds it without sanitization, so avoid converting untrusted AsciiDoc
> ([development.md](development.md)).

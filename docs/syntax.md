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

- Headings (`#` to `######`), paragraphs
- **Line breaks**: a newline inside a paragraph is not a line break
  ([cross-format specification](#common-specification-for-single-html-bundling-cross-format)). An explicit
  break is two trailing spaces or a trailing backslash (`\`). A raw `<br>` is dropped with the rest of the
  raw HTML, so the backslash is the form that survives an editor that trims trailing whitespace
- Emphasis (`*em*` / `**strong**`), inline code, links, images
- Lists (ordered / unordered), nesting, **task lists** (`- [ ]` / `- [x]`)
- Blockquotes, horizontal rules, **tables (GFM tables)**, **strikethrough** (`~~text~~`), **autolinks**
- **Alerts (GitHub alerts)**: `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]`.
  Displayed with the same structure and color scheme as AsciiDoc admonitions
  ([cross-format specification](#common-specification-for-single-html-bundling-cross-format))
- Fenced code blocks (triple backticks with an optional language identifier). Syntax highlighted with shiki
  (dual theme, dark mode support)
- **Footnotes** (`[^1]`). IDs are prefixed with the page id so they don't collide within the single HTML
- YAML frontmatter (`---`). Reads `title` / `order` / `hidden` / `description` ([roadmap.md](roadmap.md) Chapter 13) and `aliases`, the old hash routes the page still answers to ([roadmap.md](roadmap.md) 15.5)
- ` ```mermaid ` code blocks → Mermaid diagrams (`mermaid.mode`: `client` default / `pre-render` = SVG-rendered at build time)
- Images (`![alt](path)`) → the actual file under the input is embedded as a data URI
- **Math** (v0.15): the four forms GitHub renders, read by GitHub's rules ([roadmap.md](roadmap.md) 6.4)
  - `$...$`, inline. A `$` opens one after an ASCII space, `(`, or the start of a paragraph, or right
    after or inside an element, before a character that is neither a space nor `$`; it closes at the next `$` on the same
    line, unless that `$` comes before an ASCII letter, digit, or `_`, or before the same character as
    the one just before it (`$a.$.` is text), in which case there is no formula.
    So `It costs $5 and $10 today.` and `$HOME/$USER` stay text, but `Between $5 and 10$` is a formula:
    write `\$` for a dollar sign there. `値は$x$です` is text and `値は $x$ です` is math; a full-width
    space does not open one either (`値は　$x$　です` is text)
  - ``$`...`$``, inline, whatever is around it (``値は$`x`$です`` is math)
  - `$$...$$`: a paragraph that starts and ends with `$$` and holds nothing but text displays every
    `$$...$$` in it, which may cross lines, the text between them staying text. In a list item, a
    heading, or a table cell, or among other text, `$$...$$` is inline, by the same rules as `$...$`, except that the closing `$$` may come before the
    character just before it
  - a fenced code block whose language is exactly `math` (`Math` is code), displayed

  Backslash escapes are resolved before a formula is read, as CommonMark resolves them anywhere: in
  `$...$` and `$$...$$`, `\,` is `,` and `\\` is `\`. Write TeX that needs them as ``$`...`$`` or a
  `math` block, which keep every backslash. `\$` is the exception: it never opens or closes a formula,
  prints `$` outside one, and stays TeX's `\$` inside one. Character references (`&lt;`) in `$...$` and
  `$$...$$` are decoded. No formula is found in italics, a link's text, an image's alt text, a code
  span, a footnote definition (a `math` block there included), or raw `<em>`, `<b>`, `<a>`, or `<code>`

## Supported AsciiDoc Syntax

Because conversion is delegated to Asciidoctor.js's standard conversion, most AsciiDoc syntax can be used as is.

- Document title (`= Title`), section headings (`==` and beyond), paragraphs
- **Line breaks**: a newline inside a paragraph is not a line break
  ([cross-format specification](#common-specification-for-single-html-bundling-cross-format)). An explicit
  break is ` +` at the end of a line, `[%hardbreaks]` on one block, or `:hardbreaks-option:` (alias
  `:hardbreaks:`) for a whole document
- Lists (ordered / unordered / **description lists** / **checklists**), nesting, continuation lines.
  A checklist's boxes are drawn as Markdown's task list draws them
  ([cross-format specification](#common-specification-for-single-html-bundling-cross-format))
- Inline formatting such as emphasis and monospace, links, cross-references
- Tables, **admonitions** (NOTE / TIP / IMPORTANT / WARNING / CAUTION). Normalized to the
  same structure and color scheme as Markdown's GFM alerts
  ([cross-format specification](#common-specification-for-single-html-bundling-cross-format))
- Source blocks (`[source,lang]`, highlighted with shiki), literal / listing / example / sidebar / quote / verse blocks
- Callouts, `kbd:` / `btn:` / `menu:` macros
- Image macros (`image::path[]` / `image:path[]`) → data URI embedding
- `include::[]` (jailed under the input file's directory in safe mode)
- Document attributes, `:sd-title:` / `:sd-order:` / `:sd-hidden:` / `:sd-description:` ([roadmap.md](roadmap.md) Chapter 13), and `:sd-aliases:` — a comma-separated list of old hash routes ([roadmap.md](roadmap.md) 15.5)
- `[source,mermaid]` blocks → Mermaid diagrams (`mermaid.mode`: `client` default / `pre-render` = SVG-rendered at build time)
- `xref:` within the same document / internal anchors (IDs are prefixed to keep them working)
- Footnotes (`footnote:[]`). IDs are prefixed with the page id
- **Math** (v0.15): `latexmath:[...]` and the `[latexmath]` block, and `stem:[...]` and the `[stem]`
  block when they mean latexmath: `:stem:` set to `latexmath`, `latex`, or `tex` (unless a block's
  style says otherwise, as `[stem,asciimath]`), or a block's style `latexmath`. Every other `stem`, and
  `asciimath:[...]`, is asciimath, which is not rendered: it stays as Asciidoctor writes it, and a
  warning (`math/asciimath-not-rendered`) names the file and the formula. Like any warning, it fails
  `monodocs validate --strict`, and it is not given under `math.enabled: false`

## Common Specification for Single-HTML Bundling (Cross-Format)

To bundle multiple files into a single file, the following normalization is applied to the output of both formats.

- **Element ID prefixing**: All element IDs are rewritten to `{page-id}-{original-ID}`. This applies not only to headings but also to auto-generated IDs such as footnotes, preventing ID collisions across pages ([sources/prefixIds.ts](../app/packages/core/src/sources/prefixIds.ts)).
- **Routing**: A route is generated from the relative path with the extension removed (`index` → `/`), and within the single HTML, pseudo page switching is done via hash routes (`#/setup/install`).
- **Inter-file link conversion**: Markdown `.md` / `.adoc` links, AsciiDoc `xref:`, and links equivalent to the converted `.html` are converted to `#/route` (hash routes). A link that carries an anchor (`other.md#sec`) is converted to that page's prefixed element ID (`#{page-id}-sec`) instead, which lands on the anchor in both the HTML and the PDF.
- **In-page anchors**: `#id` (a hash not starting with `/`) is treated as an in-page anchor, displaying the page containing the target element and scrolling to it. This works for footnotes, internal references, and direct URLs (`docs.html#id`).
- **Line breaks inside a paragraph**: in both formats a newline inside a paragraph joins the lines rather than breaking them — CommonMark's rule and Asciidoctor's alike — and the browser renders that newline as a space. Between two East Asian characters the result depends on the engine: Firefox removes the space, and Chromium and WebKit keep it, so a Japanese paragraph written one sentence per line shows a space between the sentences in the PDF, which Chromium produces. Each format's own hard-break spellings are listed above. `sources.lineBreak` makes the choice explicit for both formats at once: `break` turns every such newline into a `<br>`, and `join` removes it between two East Asian characters (East_Asian_Width F, W, or H, neither of them Hangul), so that there the result no longer depends on the engine. A newline next to anything else — a Latin letter, an ambiguous-width character, inline code, an image — stays; `pre` and `code` are left as written. [roadmap.md](roadmap.md) 12.6 records the measurement and the reasoning.
- **Unifying admonitions / alerts**: Markdown GFM alerts (`> [!NOTE]`, etc.) and AsciiDoc admonitions (the `.admonitionblock` in Asciidoctor output) are normalized in postprocess into a common `<div class="admonition admonition-TYPE">` structure. Since the 5 types (NOTE / TIP / IMPORTANT / WARNING / CAUTION) match across both formats, a single set of CSS and colors is shared ([postprocess.ts](../app/packages/core/src/pipeline/postprocess.ts)).
- **Task lists and checklists** (v0.16): a Markdown task list item (`- [x]` / `- [ ]`) and an AsciiDoc checklist item (`* [x]` / `* [ ]`) both carry `<input type="checkbox" disabled>`, with `checked` when checked. Asciidoctor would otherwise draw the box as a character — `✓`, or `❏` (U+274F), which few fonts have and which prints as tofu — so monodocs has it write the checkbox instead. `[%interactive]` is drawn the same way, disabled: a single HTML file has nowhere to keep what a reader ticks. An item whose text merely begins with a typed `✓` stays text.
- **Section numbering** (v0.14): `numbering.sections` numbers headings continuously across all files in sidebar order, the same way for Markdown and AsciiDoc. The number is an element inside the heading (`<span class="section-number">`), never part of an ID or a route. While it is on, AsciiDoc's `:sectnums:` is refused, because it numbers each file on its own and a heading would carry two numbers ([roadmap.md](roadmap.md) 19.1).
- **Math** (v0.15): KaTeX renders each formula at build time to MathML only, adding none of its scripts or stylesheets, and the browser draws it with an OpenType MATH font. That font is needed on the machine that prints the PDF and in the reader's browser: Cambria Math ships with Windows, and on Debian and Ubuntu `fonts-lmodern` supplies Latin Modern Math. For a PDF, `fontCheck` reports a formula's letters no font draws and a formula font with no MATH table. `\mathbb`, `\mathbf`, `\mathcal`, and the other styles become Unicode's mathematical letters, since Chromium (MathML Core) ignores every `mathvariant` but `normal`. Copying a selection with a formula from the HTML gives the formula's source — as written in Markdown, and in AsciiDoc as `latexmath`, Asciidoctor having resolved `stem` — and search reads its TeX; copying from a PDF is the viewer's. A heading's ID comes from its TeX in Markdown and from Asciidoctor in AsciiDoc, as before math, and wherever a heading or a page title is shown as text (such as the sidebar, the table of contents, search results, and PDF bookmarks) a formula is shown as `$TeX$`. `math.enabled: false` turns math off and gives the previous output. `examples/math` holds the formulas v0.14 measured, in both formats, for checking a machine's fonts.

## Limitations / Unsupported (with Reasons)

Due to the need to unify multiple formats into a single HTML, or for dependency / safety reasons, the following are not supported / are restricted.

| Syntax / Feature                                                                                                              | Status                            | Reason                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw HTML in Markdown (inline / block)                                                                                         | **Unsupported** (not output)      | For safety (XSS avoidance) and consistency of mixed output, it is dropped by remark-rehype's default. If you want to embed HTML, use AsciiDoc's passthrough. The one exception is the page-break marker below, which is recognised as a marker rather than passed through: the input never reaches the output                                                                        |
| Page break (`<div class="page-break"></div>` in Markdown, `<<<` in AsciiDoc)                                                  | **Supported** (v0.11)             | Starts a new sheet in the PDF, and when the HTML is printed from a browser. In Markdown, `<div style="page-break-after: always"></div>` is accepted as the same marker; both are replaced with an element monodocs builds, so no attribute of the input survives. In Markdown the marker must be a block of its own: one inside a blockquote, a list item, a table cell, or a heading is not recognised, because the print stylesheet keeps those blocks together. In AsciiDoc the element lands wherever Asciidoctor puts `<<<`, so keep it at the top level there as well. The accepted quoting and whitespace variants are enumerated in the configuration reference on the site |
| Heading anchors in inter-file links (`other.md#sec` / `xref:other.adoc#sec`)                                                  | **Supported**                     | Resolved to the prefixed element ID (`{page-id}-{anchor}`) of the target page, so footnotes and explicit anchors work too. The anchor is matched against the ID the target file generates, so pointing from Markdown at an AsciiDoc heading needs the ID Asciidoctor produces (e.g. `_details`). An anchor that does not exist falls back to the top of that page with a warning    |
| Code highlighting (shiki)                                                                                                     | **Supported**                     | Can be disabled with `highlight.enabled: false`. Blocks with no language specified and unsupported languages are shown as plain text                                                                                                                                                                                                                                                |
| Math (Markdown `$...$` / `$$...$$` / ```` ```math ````, AsciiDoc latexmath / `stem`) | **Supported** (v0.15), with limits | Rendered at build time to MathML (see the cross-format specification above). Rendered without the part that cannot be drawn, and reported: automatic equation numbers (unstarred `equation`, `align`, `gather`; `math/numbering-unsupported`), which KaTeX's stylesheet draws and the output does not carry — a `\tag{}` in a starred environment is drawn; a style Unicode has no letters for (`\mathit{123}`; `math/style-unsupported`); an enclosure CSS cannot draw (`\phase`; `math/notation-unsupported`); and a construct the browser cannot draw as written (`\vcenter`; `math/construct-unsupported`). Shown as written, and reported: a formula using a command KaTeX gates behind `trust` (`\href`, `\includegraphics`; `math/command-not-allowed`), and one KaTeX cannot parse (`math/parse-failed`). Not rendered: asciimath (above). A display formula wider than the column scrolls on screen; on paper it is printed at its full width and cut at the page's edge if wider than the page. Accents: with Latin Modern Math the `\vec` arrow sits left of its letter (the combining arrow KaTeX writes, as that font draws it), Chromium centres the other accents on the letter's box rather than its slanted stroke, and `\widehat`, `\widetilde`, `\widecheck`, and `\utilde` stay about a letter wide over a long term, which no character serves in every font. `\overline` and `\underline` are drawn as a line as wide as the term, whatever the font. `\overrightarrow`, `\overbrace`, and `\underbrace` span the term, on screen as on paper ([roadmap.md](roadmap.md) 6.4) |
| Markdown extended syntax (definition lists / emoji shortcodes `:smile:` / `==marker==` / superscript `^x^` / subscript `~x~`) | **Unsupported**                   | Outside the scope of CommonMark / GFM. If equivalent expression is needed, use the AsciiDoc side                                                                                                                                                                                                                                                                                    |
| AsciiDoc per-document table of contents (`:toc:`)                                                                             | **Disabled**                      | Since the single HTML uses a common "in-page table of contents (right column)," per-document TOCs are not output                                                                                                                                                                                                                                                                    |
| AsciiDoc icons (`:icons: font`)                                                                                               | **Restricted** (text display)     | To avoid an external dependency on Font Awesome, admonitions are displayed with label text + color coding (prioritizing self-containment)                                                                                                                                                                                                                                           |
| Mermaid on unvisited pages during browser printing                                                                            | **Restricted** (client mode only) | Since Mermaid in client mode renders on display, browser printing (Ctrl+P) may leave diagrams on unvisited pages unrendered. Using `mermaid.mode: pre-render` renders them to SVG at build time so all diagrams appear even in print (theme is fixed at build time). monodocs PDF generation expands all pages and waits for client-mode Mermaid rendering before producing the PDF |
| PDF output (`--format pdf` / `both`)                                                                                          | **Supported** (v0.5)              | Generates a PDF from the single HTML via headless Chromium. Chromium must be available in the runtime environment, and PDF output is unavailable in the bundled CLI                                                                                                                                                                                                                 |

> Input is assumed to be trusted (self/team-managed) documentation. In particular, AsciiDoc can output
> raw HTML via passthrough and embeds it without sanitization, so avoid converting untrusted AsciiDoc
> ([development.md](development.md)).

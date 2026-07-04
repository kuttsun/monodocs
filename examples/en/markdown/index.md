---
title: GFM samples
order: 1
---

# GitHub Flavored Markdown samples

This sample covers the main syntax of [GitHub Flavored Markdown](https://github.github.com/gfm/) (CommonMark + GFM extensions) to check its rendering in `monodocs`.

Each item shows the **source (raw Markdown)** first, then the **rendered output (HTML)** below it.

Build example:

```bash
monodocs build examples/en -o dist/showcase.html
```

Open each category from the left sidebar:
[Text formatting](text.md) / [Lists](lists.md) / [Code and tables](code-and-tables.md) / [Footnotes and link references](footnotes.md) / [Alerts](alerts.md) / [Wide content](wide-content.md) / [Advanced (nested hierarchy)](advanced/index.md).

## Headings (ATX)

One to six `#` characters set the level.

**Source:**

```markdown
## Level 2

### Level 3

#### Level 4

##### Level 5

###### Level 6
```

**Rendered:**

## Level 2

### Level 3

#### Level 4

##### Level 5

###### Level 6

## Headings (Setext)

`===` / `---` underlines also create headings (H1 / H2 only).

**Source:**

```markdown
Big heading (Setext H1)
=======================

Small heading (Setext H2)
-------------------------
```

**Rendered:**

Big heading (Setext H1)
=======================

Small heading (Setext H2)
-------------------------

## Paragraphs and line breaks

A blank line separates paragraphs. A hard line break is a trailing backslash `\` (or two invisible trailing spaces).
Here we show the visible, easy-to-read backslash example.

**Source:**

```markdown
This is a paragraph. Blank lines separate paragraphs.

A backslash forces a line break.\
And here we are on the next line.
```

**Rendered:**

This is a paragraph. Blank lines separate paragraphs.

A backslash forces a line break.\
And here we are on the next line.

## Horizontal rule

`---` / `***` / `___` all create a horizontal rule.

**Source:**

```markdown
A section divider.

---
```

**Rendered:**

A section divider.

---

## Blockquotes

`>` creates a blockquote; nesting and lists inside quotes work too.

**Source:**

```markdown
> A blockquote.
>
> > A nested blockquote.
>
> - A list inside a quote
> - Second item
```

**Rendered:**

> A blockquote.
>
> > A nested blockquote.
>
> - A list inside a quote
> - Second item

## Escapes and entity references

Backslashes escape symbols, and HTML entity references work too.

**Source:**

```markdown
Escape symbols with a backslash: \*not italic\* / \`not code\` / \# not heading

Entity references: &copy; &amp; &lt; &gt; &#169; &hearts;
```

**Rendered:**

Escape symbols with a backslash: \*not italic\* / \`not code\` / \# not heading

Entity references: &copy; &amp; &lt; &gt; &#169; &hearts;

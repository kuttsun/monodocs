---
title: Footnotes
order: 5
---

# Footnotes (GFM extension)

`[^id]` creates a footnote reference and `[^id]: ...` writes its body. Footnote IDs are made unique per page within the single HTML, so they never collide across pages. Clicking a reference or a back-link scrolls to the spot without switching pages.

**Source:**

```markdown
You can place footnote references in the text[^1]. You can place several[^note].
You can also reuse the same footnote[^1]. Long notes are fine too[^long].

[^1]: This is the first footnote.
[^note]: A named-label footnote. It can include **emphasis**, `code`, and a [link](https://example.com).
[^long]:
    A multi-paragraph footnote.

    Continue the indentation to add a second paragraph.
```

**Rendered:**

You can place footnote references in the text[^1]. You can place several[^note].
You can also reuse the same footnote[^1]. Long notes are fine too[^long].

[^1]: This is the first footnote.
[^note]: A named-label footnote. It can include **emphasis**, `code`, and a [link](https://example.com).
[^long]:
    A multi-paragraph footnote.

    Continue the indentation to add a second paragraph.

---
title: Alerts (GFM alerts)
order: 6
---

# Alerts (GitHub alerts)

Placing a marker such as `[!NOTE]` at the start of a blockquote turns it into an alert.
There are five types — **NOTE / TIP / IMPORTANT / WARNING / CAUTION** — rendered with the same structure and colors as AsciiDoc admonitions (compare with [AsciiDoc Admonitions](../asciidoc/blocks.adoc)).

Each item shows the **source** first, then the **rendered output (HTML)** below it.

## The five alert types

Put the marker alone on the first line of the blockquote (if you continue text on the same line, it stays an ordinary quote).

**Source:**

```markdown
> [!NOTE]
> Supplementary information useful for the reader to know.

> [!TIP]
> A small piece of advice or a shortcut.

> [!IMPORTANT]
> Key information essential to achieving the goal.

> [!WARNING]
> Something that needs attention; overlooking it may cause problems.

> [!CAUTION]
> A warning about operations with undesirable results or risks.
```

**Rendered:**

> [!NOTE]
> Supplementary information useful for the reader to know.

> [!TIP]
> A small piece of advice or a shortcut.

> [!IMPORTANT]
> Key information essential to achieving the goal.

> [!WARNING]
> Something that needs attention; overlooking it may cause problems.

> [!CAUTION]
> A warning about operations with undesirable results or risks.

## Multiple paragraphs and other syntax

After the marker line, you can continue with paragraphs, lists, code, and so on.

**Source:**

```markdown
> [!NOTE]
> The first paragraph.
>
> The second paragraph can include **emphasis**, `code`, and lists.
>
> - Bullet 1
> - Bullet 2
```

**Rendered:**

> [!NOTE]
> The first paragraph.
>
> The second paragraph can include **emphasis**, `code`, and lists.
>
> - Bullet 1
> - Bullet 2

---
title: Lists
order: 3
---

# Lists

Each item shows the **source** first, then the **rendered output (HTML)** below it.

## Bullet lists (unordered)

`-` / `*` / `+` can all be used as markers. Indentation creates nesting.

**Source:**

```markdown
- Item A
- Item B
  - Nested B-1
  - Nested B-2
    - Even deeper
- Item C
```

**Rendered:**

- Item A
- Item B
  - Nested B-1
  - Nested B-2
    - Even deeper
- Item C

## Numbered lists (ordered)

You can also set the starting number. Two number lists separated by a paragraph become distinct lists, and the second starts from the number you specify (a blank line alone continues the same list).

**Source:**

```markdown
1. First
2. Next
3. After that
   1. Nested 3-1
   2. Nested 3-2

Specify a start number (separated by a paragraph to make a new list):

5. From 5
6. 6
7. 7
```

**Rendered:**

1. First
2. Next
3. After that
   1. Nested 3-1
   2. Nested 3-2

Specify a start number (separated by a paragraph to make a new list):

5. From 5
6. 6
7. 7

## Task lists (GFM extension)

`- [ ]` / `- [x]` create checkboxes.

**Source:**

```markdown
- [x] A completed task
- [ ] An incomplete task
  - [x] A child task (done)
  - [ ] A child task (not done)
```

**Rendered:**

- [x] A completed task
- [ ] An incomplete task
  - [x] A child task (done)
  - [ ] A child task (not done)

## Loose and tight lists

When there are blank lines between items, the list becomes "loose" and each item is rendered as a paragraph.

**Source:**

```markdown
A tight list:

- Lines are close together
- Second line

A loose list (blank lines between items):

- Rendered as paragraphs

- A blank line between items makes it loose
```

**Rendered:**

A tight list:

- Lines are close together
- Second line

A loose list (blank lines between items):

- Rendered as paragraphs

- A blank line between items makes it loose

## Multiple blocks in one item

You can continue paragraphs or quotes within a list item by matching the indentation.

**Source:**

```markdown
- An item that contains multiple paragraphs.

  This is the second paragraph of the same item (indented).

  > A quote inside the item.
```

**Rendered:**

- An item that contains multiple paragraphs.

  This is the second paragraph of the same item (indented).

  > A quote inside the item.

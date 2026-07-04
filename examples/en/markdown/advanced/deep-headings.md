---
title: Deep headings and TOC
order: 91
---

# Deep headings and the table of contents

The heading depth shown in the in-page table of contents (on the right) can be adjusted with `toc.maxLevel`.
By default, **h2–h3** appear in the TOC (h1 is always excluded since it serves as the page title).
With `toc.maxLevel: 4`, h4 is included; with `toc.maxLevel: 2`, only h2 appears.

Headings are always shown in the body regardless of whether they appear in the TOC, so making the TOC
shallower does not remove information (it's a setting to keep the TOC from getting too long).

## Level 2: Overview

This is an h2. It appears in the default TOC (h2–h3).

### Level 3: Details

This is an h3. It appears in the default TOC.

#### Level 4: Notes

This is an h4. It is not in the default TOC, but `toc.maxLevel: 4` makes it appear.

##### Level 5: Fine print

This is an h5. It appears in the TOC with `toc.maxLevel: 5` or higher.

###### Level 6: Footnote-like memo

This is an h6, the deepest heading level in Markdown.

## Level 2: Summary

On pages that use many deep headings, keeping the TOC shallow improves scannability.

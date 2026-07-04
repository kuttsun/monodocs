---
title: Advanced (nested hierarchy)
order: 90
---

# Advanced: a third-level sample

This folder (`markdown/advanced/`) holds pages placed at the **third level**.
No matter how deeply you split inputs into folders, the sidebar mirrors the folder structure as a tree.

- Even deep hierarchies stay reachable by collapsing/expanding in the sidebar (`sidebar.collapseDepth`
  lets you "collapse anything deeper than this level by default". It **collapses** rather than **hides**,
  so every page is always reachable).
- You can link to pages at the same level too: [the deep-headings page](deep-headings.md)

## Links follow even from deep folders

A link from the third level back up to the first is also converted into a hash route within the single HTML.

- One folder up: [Markdown samples](../index.md)
- Root: [Showcase](../../index.md)

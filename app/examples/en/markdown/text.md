---
title: Text formatting
order: 2
---

# Text formatting, links, and images

Each item shows the **source** first, then the **rendered output (HTML)** below it.

## Emphasis

Decorations such as italic, bold, strikethrough, and inline code.

**Source:**

```markdown
- Italic: *asterisks* / _underscores_
- Bold: **double asterisks** / __double underscores__
- Bold italic: ***triple*** / **_mixed_**
- Strikethrough (GFM): ~~struck out~~
- Inline code: `const x = 1;` / when it contains a backtick: `` `code` ``
```

**Rendered:**

- Italic: *asterisks* / _underscores_
- Bold: **double asterisks** / __double underscores__
- Bold italic: ***triple*** / **_mixed_**
- Strikethrough (GFM): ~~struck out~~
- Inline code: `const x = 1;` / when it contains a backtick: `` `code` ``

## Links

Inline, with title, reference-style, and same-site links.

**Source:**

```markdown
- Inline: [monodocs](https://example.com/monodocs)
- With title: [hover to see](https://example.com "This is a title")
- Reference link: [reference style][ref] and [collapsed][]
- Another page in the same site: [the lists page](lists.md)

[ref]: https://example.com/reference
[collapsed]: https://example.com/collapsed
```

**Rendered:**

- Inline: [monodocs](https://example.com/monodocs)
- With title: [hover to see](https://example.com "This is a title")
- Reference link: [reference style][ref] and [collapsed][]
- Another page in the same site: [the lists page](lists.md)

[ref]: https://example.com/reference
[collapsed]: https://example.com/collapsed

## Autolinks (GFM extension)

URLs and email addresses become links automatically.

**Source:**

```markdown
- A bare URL: https://github.github.com/gfm/
- In angle brackets: <https://example.com>
- Starting with `www.`: www.example.com
- Email: <docs@example.com> / contact@example.com
```

**Rendered:**

- A bare URL: https://github.github.com/gfm/
- In angle brackets: <https://example.com>
- Starting with `www.`: www.example.com
- Email: <docs@example.com> / contact@example.com

## Images

Inline images and reference-style images (images are embedded into the single HTML as data URIs).

**Source:**

```markdown
![monodocs logo](images/logo.svg "Logo")

A reference-style image:

![reference image][logo]

[logo]: images/logo.svg "Reference logo"
```

**Rendered:**

![monodocs logo](images/logo.svg "Logo")

A reference-style image:

![reference image][logo]

[logo]: images/logo.svg "Reference logo"

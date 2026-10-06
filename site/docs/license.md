# License

monodocs is released under the **MIT License**.

Copyright © 2026 kuttsun

```text
MIT License

Copyright (c) 2026 kuttsun

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Third-party licenses

monodocs itself is MIT. Most of its dependencies are permissively licensed
(MIT / ISC / BSD / Apache-2.0 / Apache-1.1 and the like). The Mermaid runtime
monodocs embeds also carries code under other terms:

- the Eclipse Layout Kernel (`elkjs`), under the **Eclipse Public License 2.0**
  (EPL-2.0), a weak copyleft license, with parts of EMF compiled into it under
  the **Eclipse Public License 1.0**;
- a few snippets adapted from Stack Overflow answers, under **CC BY-SA** 2.5 or
  3.0 by the date each was posted, a share-alike license;
- a few pieces of code from sources that state no license.

The notices name each of them, its author, and its terms.

- **What reaches your documents.** HTML built with the inline Mermaid runtime
  (`mermaid.runtime: inline`, the default) from a document with diagrams embeds
  that runtime, ELK included, together with its third-party notices, which say
  where ELK's and EMF's source is. The EPL covers ELK and EMF themselves; the content of your
  document is not affected. `mermaid.runtime: cdn`, `mermaid.mode: pre-render`,
  and a document without diagrams put no ELK in the output.
- `dompurify` is dual-licensed under `MPL-2.0 OR Apache-2.0`; monodocs elects
  the **Apache-2.0** terms.

The single-file distribution (`monodocs.cjs` and the standalone binary) embeds
its dependencies, so every build writes a `THIRD-PARTY-NOTICES.txt` alongside
the output. It reproduces the license of each bundled component, and ends with
the notices for the Mermaid runtime (d3, cytoscape, katex, dagre, roughjs, ELK
and the rest), the same notices HTML built with the inline runtime carries.

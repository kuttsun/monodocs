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

monodocs depends only on permissively licensed open-source software
(MIT / ISC / BSD / Apache-2.0 and the like). There are **no copyleft
(GPL / LGPL / AGPL) dependencies**.

- `dompurify` is dual-licensed under `MPL-2.0 OR Apache-2.0`; monodocs elects
  the **Apache-2.0** terms.

The single-file distribution (`monodocs.cjs` and the standalone binary) embeds
its dependencies, so every build writes a `THIRD-PARTY-NOTICES.txt` alongside
the output. It reproduces the license of each bundled component (~190 in total,
including the Mermaid runtime and its dependencies such as d3, cytoscape, katex,
dagre and roughjs).

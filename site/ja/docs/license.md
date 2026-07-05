# ライセンス

monodocs は **MIT License** で公開しています。

Copyright © 2026 kuttsun

原文（英語）を以下に掲載します。

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

## 第三者ライセンス

monodocs の依存はすべて寛容ライセンス（MIT / ISC / BSD / Apache-2.0 など）です。
**コピーレフト（GPL / LGPL / AGPL）の依存はありません。**

- `dompurify` は `MPL-2.0 OR Apache-2.0` のデュアルライセンスで、monodocs は
  **Apache-2.0** を選択しています。

単一ファイル配布物（`monodocs.cjs` および単体バイナリ）は依存を埋め込むため、
ビルドごとに出力の隣へ `THIRD-PARTY-NOTICES.txt` を生成します。埋め込んだ各
コンポーネント（Mermaid ランタイムと d3 / cytoscape / katex / dagre / roughjs
などの依存を含め計約 190 個）のライセンス全文を収録します。

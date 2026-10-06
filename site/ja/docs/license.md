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

monodocs 自体は MIT です。依存は寛容ライセンス（MIT / ISC / BSD / Apache-2.0 など）
ですが、例外が 1 つあります。monodocs が埋め込む Mermaid ランタイムは Eclipse Layout
Kernel（`elkjs`）を含み、これは弱いコピーレフトの **Eclipse Public License 2.0**
（EPL-2.0）です。

- **文書に届くもの。** inline の Mermaid ランタイム（`mermaid.runtime: inline`、既定）で
  図を含む文書をビルドした HTML は、ELK を含むそのランタイムを、第三者表記とともに
  埋め込みます。表記には ELK のソースの入手先を書いています。EPL-2.0 が及ぶのは ELK
  自体で、文書の内容には及びません。`mermaid.runtime: cdn`、`mermaid.mode: pre-render`、
  図を含まない文書では、出力に ELK は入りません。
- `dompurify` は `MPL-2.0 OR Apache-2.0` のデュアルライセンスで、monodocs は
  **Apache-2.0** を選択しています。
- Mermaid ランタイムの中のいくつかのコードは、ライセンスを示していない出典から来て
  います。表記はその出典と著作者を挙げています。

単一ファイル配布物（`monodocs.cjs` および単体バイナリ）は依存を埋め込むため、
ビルドごとに出力の隣へ `THIRD-PARTY-NOTICES.txt` を生成します。埋め込んだ各
コンポーネントのライセンス全文を収録し、末尾に Mermaid ランタイム（d3 / cytoscape /
katex / dagre / roughjs / ELK など）の表記を持ちます。inline ランタイムでビルドした
HTML が持つのと同じ表記です。

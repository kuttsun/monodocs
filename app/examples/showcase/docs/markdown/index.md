---
title: GFM サンプル
order: 1
---

# GitHub Flavored Markdown サンプル

このサンプルは [GitHub Flavored Markdown](https://github.github.com/gfm/)（CommonMark + GFM 拡張）の
主な記法を網羅し、`single-docs` での表示を確認するためのものです。

ビルド例:

```bash
single-docs build examples/showcase/docs -o dist/showcase.html
```

各カテゴリは左サイドバーから開けます:
[テキスト書式](text.md) / [リスト](lists.md) / [コードと表](code-and-tables.md) / [脚注とリンク参照](footnotes.md)。

## 見出し（ATX）

`#` を 1〜6 個でレベルを表します。

## レベル 2

### レベル 3

#### レベル 4

##### レベル 5

###### レベル 6

Setext 見出し（`===` / `---`）も使えます。

大見出し（Setext H1）
===================

小見出し（Setext H2）
-------------------

## 段落と改行

これは段落です。空行で段落を区切ります。

行末に空白 2 つで強制改行できます。← ここで改行
次の行です。バックスラッシュでも改行できます。\
このとおり改行されました。

## 水平線

下に水平線（`---` / `***` / `___`）:

---

## 引用

> 引用です。
>
> > ネストした引用。
>
> - 引用内のリスト
> - 2 つ目

## エスケープと実体参照

バックスラッシュで記号をエスケープ: \*not italic\* / \`not code\` / \# not heading

実体参照: &copy; &amp; &lt; &gt; &#169; &hearts;

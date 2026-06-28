---
title: ショーケース
order: 1
---

# single-docs ショーケース

`single-docs` の対応記法と機能を **1 つのサイト**でまとめて確認できるサンプルです。
左サイドバーのフォルダから各カテゴリを開けます。

- **Markdown (GFM)**: [Markdown サンプル](markdown/index.md)
- **AsciiDoc**: [AsciiDoc サンプル](asciidoc/index.adoc)

上の 2 つ目は Markdown から AsciiDoc ページへのリンクです。形式をまたいだリンクも
単一 HTML 内の hash route に変換されます（混在対応）。

## ビルド / プレビュー

```bash
single-docs build examples/showcase/docs -o dist/showcase.html
single-docs serve examples/showcase/docs            # http://127.0.0.1:4173/
```

## このサイトで確認できる機能

- 全文検索 / ページ内目次（スクロール連動）/ 前後ページナビ
- ダークモード / サイドバー折りたたみ・自動展開
- コードハイライト（shiki）/ Mermaid 図
- 画像の data URI 埋め込み / ファイル間リンク・AsciiDoc xref / 脚注
- 印刷時の全ページ縦展開

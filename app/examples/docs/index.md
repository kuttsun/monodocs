---
title: ショーケース
order: 1
---

# monodocs ショーケース

`monodocs` の対応記法と機能を **1 つのサイト**でまとめて確認できるサンプルです。
左サイドバーのフォルダから各カテゴリを開けます。

各記法ページは **ソース（生の Markdown / AsciiDoc）** を先に示し、その下に
**表示（HTML 変換結果）** を並べる対比形式で、記述と描画の対応がひと目で分かります。

- **Markdown (GFM)**: [Markdown サンプル](markdown/index.md)
- **AsciiDoc**: [AsciiDoc サンプル](asciidoc/index.adoc)
- **混在（同一フォルダ）**: [Markdown / AsciiDoc 混在](mixed/index.md)

2・3 つ目は Markdown から AsciiDoc ページへのリンクです。形式をまたいだリンクも
単一 HTML 内の hash route に変換されます（混在対応）。

## ビルド / プレビュー

```bash
monodocs build examples/docs -o dist/showcase.html
monodocs serve examples/docs            # http://127.0.0.1:4173/
```

## このサイトで確認できる機能

- 全文検索 / ページ内目次（スクロール連動）/ 前後ページナビ
- ダークモード / サイドバー折りたたみ・自動展開
- コードハイライト（shiki）/ Mermaid 図
- 画像の data URI 埋め込み / ファイル間リンク・AsciiDoc xref / 脚注
- 印刷時の全ページ縦展開

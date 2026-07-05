---
title: PDF 出力
order: 2
---

# PDF 出力

`monodocs` は、生成した **単一 HTML を経由して PDF** も出力できます。入力は分割管理したまま、
配布物を 1 ファイル（HTML でも PDF でも）にまとめられます。

```bash
monodocs build examples/ja --format pdf  -o dist/showcase.pdf   # PDF のみ
monodocs build examples/ja --format both -o dist/showcase       # HTML と PDF の両方
```

- `--format both` は `-o` を **ディレクトリ**として扱い、その中に `manual.html` と
  `manual.pdf` を出力します。
- 内部ではヘッドレス Chromium で単一 HTML を開き、印刷用レイアウト（全ページを縦に展開）で
  PDF 化します。**このページ自体も PDF に含められます。**

## PDF に含まれるもの

- **しおり（アウトライン）**: HTML の左サイドバーと同じ **フォルダ → ページ** の階層。
  ビューアのしおりパネルから各ページへジャンプできます。
- **本文中のリンク**: ページ間リンク・脚注・見出しアンカーは、PDF 内でもクリックして移動
  できます。
- **画像**: data URI として埋め込むため、PDF 単体で完結します（外部ファイルを参照しません）。
- **コードハイライト / 図 / 表 / アラート**: HTML と同じ体裁で描画されます。
- **改ページの配慮**: アラートや図・コードブロックはできる限りページ途中で分割しません。

> [!NOTE]
> ダーク/ライトのトグルは HTML 用の機能です。PDF は印刷用のライト配色で出力されます。

## 設定（`monodocs.config.yml`）

```yaml
pdf:
  pageSize: "A4" # A4 / Letter など
  margin:
    top: "20mm"
    right: "15mm"
    bottom: "20mm"
    left: "15mm"
  printBackground: true # 背景色・背景画像を印刷する
  bookmarks: true # しおり（サイドバー構造）を付与する
```

## 実行環境の要件

> [!IMPORTANT]
> PDF 出力はヘッドレス Chromium を使うため、実行環境に **Chromium** が必要です。また PDF は
> **実行環境のシステムフォント**で描画されるため、本文に出す文字種（日本語・絵文字など）の
> フォントが無いと豆腐（□ / ☒）になります。開発用イメージには日本語（CJK）と絵文字フォントを
> 同梱しています。

> [!WARNING]
> バンドル版 CLI（単一 `.cjs` / 単一実行ファイル）では PDF 出力は利用できません
> （`puppeteer-core` を同梱しないため）。PDF を出す場合はパッケージインストール版を使ってください。

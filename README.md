# monodocs

複数の Markdown / AsciiDoc ファイルから、**単一の HTML または PDF** ドキュメントを生成する CLI ツールです。

ドキュメントは複数ファイルに分割して管理しながら、配布時には 1 ファイルにまとめられることを目的としています。

> **Status: v0.4 実装済み** — Markdown / AsciiDoc（混在可）から単一 HTML を生成できます。
> リンク変換・画像埋め込み・Mermaid・メタデータ・validate に加え、HTML 内検索・ページ内目次・
> 前後ナビ・ダークモード・印刷用レイアウト・`watch` / `serve` に対応。
> PDF などは未対応です。詳細は [docs/status.md](docs/status.md) を参照してください。

## 特徴

- 複数 Markdown / AsciiDoc ファイルを単一 HTML にまとめる（混在対応）
- フォルダ構造に従ったサイドバー目次を自動生成する（折りたたみ可能）
- 見出しタイトルからサイドバーを構成する（Markdown は H1、AsciiDoc は `= Title`）
- ファイル間リンク（`.md` / `.adoc` / xref）を単一 HTML 内の hash route に変換する
- 画像を data URI として埋め込み、自己完結した単一 HTML にする
- Mermaid を表示する（client mode。ランタイムは CDN / inline を選択可能）
- コードブロックを shiki で構文ハイライトする（dual theme でダークモードに追従）
- frontmatter / `:sd-*:` で order・hidden・description を制御する
- HTML 内で全文検索できる（タイトル・見出し・本文）
- ページ内目次（h2 / h3）と前後ページナビゲーションを表示する
- ダークモード（OS 設定に追従、手動切替は localStorage に保存）
- 印刷時は全ページを縦に展開する print 用レイアウト
- `watch` で変更を監視して再ビルド、`serve` でライブリロード付きローカルプレビュー
- `validate` でリンク切れ・画像欠落などを検出する
- GitHub Flavored Markdown に対応する

> Mermaid の既定は `runtime: inline`（ランタイムを埋め込み**自己完結**。図があると約 975KB(gzip) 増）です。
> HTML を最小化したい場合は `runtime: cdn`（表示にネットワークが必要）に切り替えられます。JS 無しでビルド時に
> SVG 化する `mode: pre-render`（要 Chromium）もあります。画像サイズ上限（`assets.maxInlineSize`）超過時の
> 既定 `warn` は「警告しつつ埋め込む」挙動です（埋め込まない場合は `external`）。

> PDF 出力などは今後のバージョンで対応予定です（[docs/roadmap.md](docs/roadmap.md)）。

> **入力は信頼できるドキュメントを前提とします。** AsciiDoc は生 HTML を出力できるため、
> 信頼できない入力の変換は避けてください（詳細は [docs/development.md](docs/development.md)）。

`monodocs` は Pandoc の代替を直接目指すものではなく、
**単一ファイル配布に特化した軽量ドキュメントジェネレータ**を目指します。

## 使い方

入力は Markdown / AsciiDoc を混在できます。フォルダ構造がそのままサイドバーになります。

```text
docs/
  index.md
  setup/
    install.adoc
    config.md
  guide/
    usage.md
```

このフォルダから単一 HTML を生成します。

```bash
monodocs build ./docs -o ./dist/manual.html
```

生成された `manual.html` をブラウザで開くと、左サイドバーから各ページを切り替えられます。
サイドバーの検索ボックスで全文検索、右側にページ内目次、本文下に前後ページナビが表示されます。
右上のトグルでダークモード・サイドバーの開閉ができます。印刷（PDF 保存）すると全ページが縦に展開されます。

編集しながら確認する場合は、`watch`（変更を監視して再ビルド）や `serve`（ライブリロード付き
ローカルプレビュー）が使えます。

```bash
monodocs watch ./docs -o ./dist/manual.html
monodocs serve ./docs            # 既定で http://127.0.0.1:4173/ を配信
monodocs serve ./docs --open     # 起動時にブラウザを開く
```

リンク切れや画像欠落などは `validate` で検出できます。

```bash
monodocs validate ./docs
```

> **現時点での実行方法**: `monodocs` の npm 公開は v0.6 で対応予定です。
> それまではホストを汚さない専用 Docker イメージで実行します（Docker のみ必要）。
> 全記法のショーケースをすぐ確認したいだけなら、次節の `scripts/app-serve.sh` が手軽です。
> HTML へのビルドやテストなど開発向けの手順は [docs/development.md](docs/development.md) を参照してください。

## ローカルプレビュー（目視確認）

専用 Docker イメージで `serve` を起動し、ホストのブラウザで動作を確認できます。
ホストに Node / pnpm は不要です（Docker のみ）。

```bash
# 全記法・全機能をまとめたショーケースを配信（ライブリロード付き）
# 依存インストール（初回のみ）・ビルド・serve をまとめて実行する
scripts/app-serve.sh
```

起動後、ブラウザで **`http://localhost:4173/`** を開きます（`http://0.0.0.0:...` ではなく `localhost`）。
止めるときは `Ctrl+C`。別ポートにするには `MONODOCS_PORT=8080 scripts/app-serve.sh --port 8080`。

- `examples/ja`（日本語）/ `examples/en`（英語）は、Markdown(GFM) / AsciiDoc / 混在の全記法・全機能を 1 サイトにまとめたショーケースです。
- 配信中にサンプル内のファイルを編集すると、ブラウザが自動でリロードします。
- Mermaid は既定で `runtime: inline`（自己完結）です。`runtime: cdn` にすると HTML は軽くなりますが、図の描画にブラウザ側のネット接続が必要になります。

確認するとよい項目:

- サイドバー（Markdown / AsciiDoc 混在・ディレクトリ折りたたみ・☰ で開閉）
- 検索ボックス（タイトル / 本文 / 見出しの全文検索）
- ページ内目次（右カラム。スクロールで現在地をハイライト）と前後ページナビ
- ダークモード切替（🌙/☀️。リロードしても保持）
- コードハイライト（shiki）と Mermaid 図
- 画像埋め込み・ページ間リンク（`#/...` への変換）
- 印刷プレビュー（Ctrl+P）で全ページが縦に展開されること

> 個別ステップ（依存インストール・ビルド単体）や、テスト・型チェックなどの開発コマンド、
> VS Code Dev Containers での実行方法は [docs/development.md](docs/development.md) を参照してください。

## 設定ファイル（任意）

入力ディレクトリ自身に `monodocs.config.yml` を置くと挙動をカスタマイズできます。
`--config` を省略した場合は入力ディレクトリ直下の設定ファイルを使います。
無い場合はデフォルト（入力 `./docs`、出力 `./dist/manual.html`）が使われます。

```yaml
title: "社内ドキュメント"
input: "./docs"
output:
  format: "html"
  path: "./dist/manual.html"
sidebar:
  exclude:
    - "_partials/**"
  # 明示タイトル（frontmatter title / :sd-title:）以外の表示タイトル変換。
  # page は見出し・ファイル名由来のページ表示タイトル、directory はフォルダ表示名に適用する。
  # type: none（既定）/ stripNumberPrefix / regex
  titleTransform:
    page:
      type: "none"
      # type: "regex"
      # pattern: "^REQ-\\d+:\\s*"
      # replacement: ""
      # flags: "gi"
    directory:
      type: "none"
      # type: "stripNumberPrefix"
  # タイトルの取得元。"heading"（既定）= frontmatter → 見出し(H1) → ファイル名。
  # "filename" = 見出しがあってもファイル名をタイトルに使う（明示タイトルは常に最優先）。
  titleFrom: "heading"
sources:
  markdown:
    extensions: [".md", ".markdown"]
  asciidoc:
    extensions: [".adoc", ".asciidoc", ".asc"]
assets:
  embedImages: true
  maxInlineSize: "5MB"
  onLargeImage: "warn" # warn=警告して埋め込む / external=埋め込まない / error=失敗
mermaid:
  enabled: true
  mode: "client" # client=ブラウザ描画 / pre-render=ビルド時 SVG 化（要 Chromium）
  runtime: "inline" # inline=自己完結（既定・HTML 肥大） / cdn=軽量・要ネット（client のみ）
highlight:
  enabled: true # コードブロックを shiki で構文ハイライト（false で無効）
html:
  theme: "default"
  contentWidth: "860px" # 固定幅。例: "1100px" / "72rem" / full=横幅いっぱい
```

設定項目の全体像は [docs/roadmap.md](docs/roadmap.md) の「12. 設定ファイル」を参照してください。

## ドキュメント

開発方針・技術スタック・ロードマップ・実装状況・テストは [docs/](docs/) にまとめています。

| ドキュメント                              | 内容                                         |
| ----------------------------------------- | -------------------------------------------- |
| [docs/development.md](docs/development.md) | 開発方針・開発環境・ディレクトリ構成・設計   |
| [docs/tech-stack.md](docs/tech-stack.md)  | 技術スタックとバージョン方針                 |
| [docs/roadmap.md](docs/roadmap.md)        | 仕様・ロードマップ                           |
| [docs/syntax.md](docs/syntax.md)          | 対応記法と制限（Markdown / AsciiDoc）        |
| [docs/status.md](docs/status.md)          | 実装状況                                     |
| [docs/testing.md](docs/testing.md)        | テスト方針・テスト結果                       |

アプリ本体のソースは [app/](app/) にあります。

## ライセンス

未定（TBD）。

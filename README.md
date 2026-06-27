# single-docs

複数の Markdown / AsciiDoc ファイルから、**単一の HTML または PDF** ドキュメントを生成する CLI ツールです。

ドキュメントは複数ファイルに分割して管理しながら、配布時には 1 ファイルにまとめられることを目的としています。

> **Status: v0.2 実装済み** — Markdown / AsciiDoc（混在可）から単一 HTML を生成できます。
> PDF などは未対応です。詳細は [docs/status.md](docs/status.md) を参照してください。

## 特徴

- 複数 Markdown ファイルを単一 HTML にまとめる
- 複数 AsciiDoc ファイルを単一 HTML にまとめる
- Markdown / AsciiDoc の混在に対応する
- フォルダ構造に従ったサイドバー目次を自動生成する
- 見出しタイトルからサイドバーを構成する（Markdown は H1、AsciiDoc は `= Title`）
- GitHub Flavored Markdown に対応する
- 単一 HTML として自己完結（hash route によるページ切り替え）

> 画像の data URI 埋め込み・Mermaid・リンク変換・PDF 出力は今後のバージョンで対応予定です（[docs/roadmap.md](docs/roadmap.md)）。

> **入力は信頼できるドキュメントを前提とします。** AsciiDoc は生 HTML を出力できるため、
> 信頼できない入力の変換は避けてください（詳細は [docs/development.md](docs/development.md)）。

`single-docs` は Pandoc の代替を直接目指すものではなく、
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
single-docs build ./docs -o ./dist/manual.html
```

生成された `manual.html` をブラウザで開くと、左サイドバーから各ページを切り替えられます。

> **現時点での実行方法**: `single-docs` の npm 公開は v0.6 で対応予定です。
> それまではリポジトリ内でビルドして実行します（[docs/development.md](docs/development.md) 参照）。
>
> ```bash
> cd app
> pnpm install && pnpm build
> node packages/cli/dist/index.js build examples/mixed/docs -o dist/manual.html
> ```

## 設定ファイル（任意）

入力ディレクトリのあるプロジェクトに `single-docs.config.yml` を置くと挙動をカスタマイズできます。
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
sources:
  markdown:
    extensions: [".md", ".markdown"]
  asciidoc:
    extensions: [".adoc", ".asciidoc", ".asc"]
```

設定項目の全体像は [docs/roadmap.md](docs/roadmap.md) の「12. 設定ファイル」を参照してください。

## ドキュメント

開発方針・技術スタック・ロードマップ・実装状況・テストは [docs/](docs/) にまとめています。

| ドキュメント                              | 内容                                         |
| ----------------------------------------- | -------------------------------------------- |
| [docs/development.md](docs/development.md) | 開発方針・開発環境・ディレクトリ構成・設計   |
| [docs/tech-stack.md](docs/tech-stack.md)  | 技術スタックとバージョン方針                 |
| [docs/roadmap.md](docs/roadmap.md)        | 仕様・ロードマップ                           |
| [docs/status.md](docs/status.md)          | 実装状況                                     |
| [docs/testing.md](docs/testing.md)        | テスト方針・テスト結果                       |

アプリ本体のソースは [app/](app/) にあります。

## ライセンス

未定（TBD）。
